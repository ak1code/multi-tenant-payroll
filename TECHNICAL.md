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

## 3. Tenant Isolation

Every authenticated request carries `tenantId` in the JWT payload. Services **always** prepend `{ tenantId: user.tenantId }` to MongoDB queries — never relying on client-supplied tenant IDs.

`TenantContext` + `TenantInterceptor` populate request-scoped tenant metadata after JWT validation. **Enforcement is applied in service-layer queries** via `@CurrentUser()` — each payroll method explicitly filters by `user.tenantId` from the signed JWT.

## 4. Authentication & Refresh Tokens

- **Access tokens** — short-lived JWT (15m), signed with `JWT_SECRET`
- **Refresh tokens** — longer-lived JWT (7d), signed with `JWT_REFRESH_SECRET`, includes a unique `jti` claim per issuance
- **Server-side storage** — SHA-256 hash of the refresh JWT stored on the `User` document (`refreshToken` field)
- **Rotation** — every login or refresh overwrites the stored hash; the previous refresh token can no longer be validated
- **Logout** — clears `refreshToken` to `null` when the presented token matches the stored hash
- **Tradeoff** — one active refresh session per user; a new login invalidates any previous device's refresh token. A separate `refresh_tokens` collection would be needed for multi-device sessions.

Passwords use bcrypt; refresh token hashes use SHA-256 (bcrypt truncates inputs longer than 72 bytes, which JWTs exceed).

## 5. Role Scoping

| Role | Upload | Batch Status | Search |
|---|---|---|---|
| ADMIN | Yes | Yes | All tenant records |
| HR | No | Yes | All tenant records |
| SUPERVISOR | No | No | Only records where `supervisorId === user._id` |

Supervisor scoping uses **denormalized `supervisorId`** on `DisbursementRecord` (copied from Employee at write time) — avoids joins on every search query.

## 6. Idempotency Strategy

1. Compute **SHA-256** hash of raw CSV file bytes
2. Store hash on `Batch.fileHash` with a **unique MongoDB index**
3. Duplicate upload → MongoDB E11000 → API returns **409 Conflict**
4. Concurrent duplicate uploads race on the unique index — only one batch is created

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
- `enableShutdownHooks()` registered for graceful BullMQ worker shutdown on SIGTERM
