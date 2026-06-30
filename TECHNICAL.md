# Technical Documentation — Multi-Tenant Bulk Payroll System

## 1. Architecture Overview

This backend is a NestJS application with four core modules:

- **AuthModule** — JWT access tokens (15m) and rotating refresh tokens (7d), bcrypt password hashing
- **PayrollModule** — CSV upload, row validation, BullMQ job enqueue, search API
- **UsersModule / EmployeesModule / TenantModule** — data models and tenant-scoped lookups
- **DatabaseModule** — MongoDB via Mongoose

External dependencies:

| Service | Purpose |
|---|---|
| MongoDB | Tenants, users, employees, batches, disbursement records, dead-letter jobs |
| Redis | BullMQ queue backend for async disbursement processing |

**Swagger UI** is available at `/api/docs` for interactive API testing.

### How components interact

Typical upload flow: **Admin** → `PayrollController` → `PayrollService` (hash file, create batch, validate rows) → **MongoDB** (batches + disbursement records) and **BullMQ/Redis** (one job per valid row) → `PayrollProcessor` worker → `mockDisbursementFunction`. Search and batch-status reads go through the same controller/service layer back to MongoDB. Auth is handled by `AuthModule` before any payroll route runs.

See [docs/flow-diagram.md](docs/flow-diagram.md) for the full upload → queue → worker → success/retry/dead-letter diagram.

## 2. Queue / Retry / Dead-Letter Design

- Queue name: `payroll-disbursement`
- **5 attempts** with **exponential backoff** starting at 2s (2s → 4s → 8s → 16s → 32s)
- Mock disbursement has **20% random failure** and **200–1500ms latency** to simulate downstream payment gateway
- On final failure: record → `DEAD_LETTERED`, document inserted into `deadletterjobs` collection
- Completed jobs removed from Redis (`removeOnComplete: true`); failed jobs kept for inspection

### At 100x batch size

Current design updates MongoDB per row. At very high scale:

- Run **multiple worker instances** horizontally (BullMQ supports this natively)
- Replace per-row batch counter updates with **Redis atomic counters** + periodic flush to MongoDB
- Move CSV parsing to a dedicated **`batch-parse` BullMQ job** so parsing survives process restarts
- Consider **bulk insert** for disbursement records instead of one-at-a-time

## 3. Tenant Isolation & Structural Enforcement

Every authenticated request carries `tenantId` in the JWT payload. Services **always** prepend `{ tenantId: user.tenantId }` to MongoDB queries — never relying on client-supplied tenant IDs.

**Defense layers (tenant + role):**

1. **`JwtAuthGuard`** — unauthenticated requests are rejected before handlers run
2. **`RolesGuard` + `@Roles()`** — role checked on each payroll endpoint (e.g. upload is Admin-only)
3. **Service-layer queries** — `user.tenantId` from the signed JWT is always included in MongoDB filters (`getBatchStatus`, `search`, etc.)
4. **`buildQuery()`** — single method for search filters; adds `supervisorId` when the caller is a Supervisor
5. **Integration tests** — cross-tenant access and cross-supervisor record access are covered in e2e tests

`TenantInterceptor` sets request-scoped `TenantContext` after JWT validation for potential shared helpers; **today, enforcement lives in explicit service queries** via `@CurrentUser()`.

**What stops a future change from bypassing this?** There is no automatic Mongoose plugin or repository that injects `tenantId` on every query. A new endpoint that omits guards or forgets `tenantId` in a query could leak data. Mitigation: convention (always use guards + `@CurrentUser()`), centralized `buildQuery()` for search, and tests that fail if scoping regresses. A shared tenant-scoped repository would be the next hardening step.

## 4. Authentication & Refresh Tokens

- **Access tokens** — short-lived JWT (15m), signed with `JWT_SECRET`
- **Refresh tokens** — longer-lived JWT (7d), signed with `JWT_REFRESH_SECRET`, includes a unique `jti` claim per issuance
- **Server-side storage** — SHA-256 hash of the refresh JWT stored on the `User` document (`refreshToken` field)
- **Rotation** — every login or refresh overwrites the stored hash; the previous refresh token can no longer be validated
- **Logout** — clears `refreshToken` to `null` when the presented token matches the stored hash
- **Tradeoff** — one active refresh session per user; a new login invalidates any previous device's refresh token. A separate `refresh_tokens` collection would be needed for multi-device sessions.

Passwords use bcrypt; refresh token hashes use SHA-256 (bcrypt truncates inputs longer than 72 bytes, which JWTs exceed).

## 5. Role Scoping

Role rules are enforced structurally via `RolesGuard` and `@Roles()` (see §3). Endpoint access:

| Role | Upload | Batch Status | Search |
|---|---|---|---|
| ADMIN | Yes | Yes | All tenant records |
| HR | No | Yes | All tenant records |
| SUPERVISOR | No | No | Only records where `supervisorId === user._id` |

Supervisor scoping uses **denormalized `supervisorId`** on `DisbursementRecord` (copied from Employee at write time) — avoids joins on every search query. The filter is applied inside `buildQuery()`, not repeated per endpoint.

## 6. Idempotency Strategy

1. Compute **SHA-256** hash of raw CSV file bytes
2. Store hash on `Batch.fileHash` with a **unique MongoDB index**
3. Duplicate upload → MongoDB E11000 → API returns **409 Conflict** — no rows are parsed, no jobs enqueued, and no disbursements run (duplicate **processing** prevented, not just duplicate batch storage)
4. Concurrent duplicate uploads race on the unique index — only one batch is created
5. **Within-file dedup:** duplicate `employeeId + payPeriod` in the same CSV are marked `INVALID` and never queued
6. **Cross-file dedup:** the same `tenantId + employeeId + payPeriod` is rejected when a prior disbursement is `SUCCEEDED` or in-flight (`PENDING` / `PROCESSING` / `RETRYING`). Rows are marked `INVALID` with a clear reason — no second queue job or disbursement call. Retries are allowed after `DEAD_LETTERED` or `INVALID` (e.g. admin uploads a corrected file). A **partial unique MongoDB index** on `{ tenantId, employeeId, payPeriod }` for active/success statuses prevents race duplicates when two different files are uploaded concurrently

## 7. Indexing Decisions

| Index | Collection | Why |
|---|---|---|
| `{ tenantId, employeeId }` unique | Employee | Business ID lookup during CSV validation |
| `{ fileHash }` unique | Batch | Idempotency |
| `{ tenantId, createdAt }` | Batch | List batches by tenant |
| `{ tenantId, status }` | DisbursementRecord | Filter search by status |
| `{ tenantId, payPeriodSort }` | DisbursementRecord | Pay-period month range queries |
| `{ tenantId, payPeriod }` | DisbursementRecord | Exact pay-period lookup |
| `{ tenantId, employeeName }` text | DisbursementRecord | Partial name search |
| `{ supervisorId, tenantId }` | DisbursementRecord | Supervisor scope filter |
| `{ batchId }` | DisbursementRecord | Batch status aggregation |
| `{ tenantId, employeeId, payPeriod }` unique (partial: active/success statuses) | DisbursementRecord | Cross-file disbursement dedup + race safety |

## 8. Pagination Choice

Search uses **offset-based pagination** (`page` + `limit`) because:

- Filters are dynamic (name, status, pay-period range) — cursor pagination would require encoding composite cursors
- Expected result sets are moderate (thousands, not millions)

Pay periods are stored as canonical `YYYY-M` strings (e.g. `2024-1`) with a numeric `payPeriodSort` field (`year * 100 + month`) for efficient inclusive range filtering. The assignment's "date range" search requirement is implemented as a **pay-period month range** via `payPeriodFrom` / `payPeriodTo` query parameters.

For real-time infinite scroll at scale, cursor-based pagination on `_id` + filter would be preferred.

## 9. Known Limitations / Shortcuts

- CSV row parsing runs in-process via `setImmediate` after 202 response — a dedicated BullMQ parse job would be more resilient
- Batch counters updated per-row in MongoDB — at very high scale, use Redis counters
- No rate limiting on upload endpoint (would add in production)
- No email/webhook notification on batch completion
- **No payment reversal** — cross-file dedup blocks re-pay for `SUCCEEDED` rows; correcting an amount requires a void/reversal workflow (out of scope)
- **Global `fileHash` index** — identical file bytes cannot be uploaded twice even across tenants (stricter than per-tenant; acceptable for this assignment)
- **Byte-level idempotency only for exact re-upload** — same payroll in a reordered or reformatted CSV is treated as a new file; overlapping rows are still blocked by cross-file `employeeId + payPeriod` dedup (§6.6)
- `enableShutdownHooks()` registered for graceful BullMQ worker shutdown on SIGTERM
