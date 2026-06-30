# Multi-Tenant Bulk Payroll Processing System

Production-level NestJS backend for multi-tenant HR platforms — bulk employee salary disbursements via CSV upload and async Redis-backed BullMQ queue.

## Prerequisites

- **Node.js 20 LTS** (see `.nvmrc`)
- **MongoDB 7** (default port `27017`)
- **Redis 7** (default port `6379`)

On Windows, `npm install` may require [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) for native `bcrypt` compilation.

## Install MongoDB and Redis (One-Time)

These services must be running locally before you start the app.

### Windows

| Service | Install |
|---|---|
| **MongoDB** | [MongoDB Community Server MSI](https://www.mongodb.com/try/download/community) — choose "Install as a Windows Service" |
| **Redis** | Use **WSL2** (recommended) or [Memurai](https://www.memurai.com/) (Redis-compatible for Windows). Native Redis on Windows is unreliable. |

**WSL2 Redis setup:**
```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**Memurai:** Install from the website and start the Memurai service from Windows Services.

### macOS

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0 redis
brew services start mongodb-community@7.0
brew services start redis
```

### Linux

```bash
sudo apt update
sudo apt install mongodb redis-server
sudo systemctl start mongod
sudo systemctl start redis-server
```

### Verify Services Are Running

```powershell
# MongoDB
mongosh --eval "db.runCommand({ ping: 1 })"

# Redis (use WSL terminal if Redis runs in WSL)
redis-cli ping
# Expected: PONG
```

Or run the project check script after cloning:

```bash
npm run check:services
```

## Quick Start (Clean Clone)

```bash
# 1. Clone and install
git clone <your-repo-url>
cd payroll
npm install

# 2. One-command setup (creates .env, checks MongoDB + Redis, seeds DB)
npm run setup

# 3. Start API
npm run start:dev
```

**Manual setup** (if you prefer step-by-step):

```powershell
# Windows
copy .env.example .env

# macOS / Linux
# cp .env.example .env

npm run check:services
npm run seed
npm run start:dev
```

> **Note:** `npm run seed` **wipes all existing data** in the database. Run it only on first setup or when you want to reset demo data.

API: http://localhost:3000  
Swagger: http://localhost:3000/api/docs  
Health: http://localhost:3000/health (reports MongoDB and Redis connectivity)

A sample CSV (`sample-payroll.csv`, 530 rows) is included in the repo. Columns: `employeeId`, `amount`, `payPeriod` (format `YYYY-M`, e.g. `2024-1`). To regenerate it:

```bash
npm run generate:csv
```

## Test Accounts

| Tenant | Role | Email | Password |
|---|---|---|---|
| Alpha Corp | Admin | admin@alpha.com | Admin@123 |
| Alpha Corp | HR | hr@alpha.com | Hr@123 |
| Alpha Corp | Supervisor 1 | supervisor1@alpha.com | Super@123 |
| Alpha Corp | Supervisor 2 | supervisor2@alpha.com | Super@123 |
| Beta Industries | Admin | admin@beta.com | Admin@123 |
| Beta Industries | HR | hr@beta.com | Hr@123 |
| Beta Industries | Supervisor 1 | supervisor1@beta.com | Super@123 |
| Beta Industries | Supervisor 2 | supervisor2@beta.com | Super@123 |

Each tenant has 25 employees: `EMP001`–`EMP025`.

## API Usage (curl)

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@alpha.com","password":"Admin@123"}'
```

### Upload CSV (Admin only)

```bash
TOKEN=<accessToken from login>

curl -X POST http://localhost:3000/payroll/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample-payroll.csv"
```

### Batch Status

```bash
curl http://localhost:3000/payroll/batch/<batchId>/status \
  -H "Authorization: Bearer $TOKEN"
```

### Search Disbursements

CSV `payPeriod` column uses **year-month** format: `2024-1`, `2024-12` (month 1–12).

```bash
# Exact pay period
curl "http://localhost:3000/payroll/search?payPeriod=2024-6&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Pay period range (inclusive)
curl "http://localhost:3000/payroll/search?payPeriodFrom=2024-1&payPeriodTo=2024-6&status=SUCCEEDED" \
  -H "Authorization: Bearer $TOKEN"

# By employee name
curl "http://localhost:3000/payroll/search?employeeName=Employee&status=SUCCEEDED&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

## 5-Minute Demo Flow

1. Ensure MongoDB and Redis are running, then `npm run setup`
2. `npm run start:dev`
3. Open Swagger at `/api/docs`
4. Login as `admin@alpha.com`
5. Upload `sample-payroll.csv`
6. Poll `GET /payroll/batch/:batchId/status` until `COMPLETED` or `PARTIALLY_FAILED`
7. Login as `hr@alpha.com` → search all records
8. Login as `supervisor1@alpha.com` → search (only EMP001–EMP012 visible)

## Tests

```bash
# Unit tests (no external services required)
npm run test

# Integration tests (uses in-memory MongoDB + Redis via test globalSetup)
npm run test:e2e

# Coverage
npm run test:cov
```

Integration tests spin up **mongodb-memory-server** and **redis-memory-server** automatically — no local MongoDB or Redis needed to run tests.

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

## Documentation

- [TECHNICAL.md](TECHNICAL.md) — architecture, indexing, idempotency, scaling notes
- [docs/flow-diagram.md](docs/flow-diagram.md) — Mermaid processing flow

## Stack

NestJS · MongoDB · BullMQ · Redis · JWT · Swagger · Jest
