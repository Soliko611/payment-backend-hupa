# Northstar Wallet

## Overview & Architecture

Northstar Wallet is a high-concurrency financial wallet backend built with Node.js, Express, and PostgreSQL. It is designed to make balance-changing operations correct under concurrent traffic, with Supabase PostgreSQL supported as a hosted database.

The request path is:

```text
React client -> Express API -> PostgreSQL (local or Supabase)
```

The client handles presentation and sends authenticated API requests. Express routes and middleware enforce the HTTP and authentication boundary; controllers translate requests; services own validation, SQL, and transaction behavior. PostgreSQL is the source of truth for balances, transfers, idempotency records, and audit events.

Balances and transfer amounts are integer wallet units (`1000` for a new account). API responses serialize amounts as decimal strings to avoid JavaScript precision loss. PostgreSQL transactions and constraints protect financial state; Supabase hosts PostgreSQL but does not replace the backend's authorization or transfer logic.

**Stack:** Node.js 20+, Express 4, PostgreSQL (`pg` / Supabase), React, and Vite.

## Core Engineering Challenges & Solutions

### Double-spending and race conditions

Each transfer runs on a dedicated PostgreSQL client inside `BEGIN` / `COMMIT` / `ROLLBACK`. The service locks both participating account rows with `SELECT ... FOR UPDATE`, reads the sender's balance while holding the lock, and rejects an insufficient balance before applying either balance change. Concurrent transfers involving the same account therefore serialize at that account's row lock; a second withdrawal cannot spend a balance already committed by the first.

### Deadlock elimination through global lock ordering

Every transfer computes `firstId = Math.min(senderId, receiverId)` and `secondId = Math.max(senderId, receiverId)` and acquires the two row locks in that deterministic order. Opposite-direction transfers follow the same global order, preventing a cycle in which each transaction holds one account while waiting for the other.

### Duplicate-payment prevention

Clients may provide a UUID `Idempotency-Key`. Keys are scoped to the authenticated user and stored with a hash of the request and the original response in the same transfer transaction. Retrying the same key and payload returns the original response without executing another payment; reusing the key with a different payload returns `409 Conflict`. Successful replays are recorded in the audit log.

### Financial ledger integrity

- Database constraints reject negative balances, non-positive transfer amounts, invalid account references, and self-transfers.
- A transfer debits the sender, credits the receiver, inserts the transfer record, completes its idempotency record, and writes the success audit event within one transaction. These changes commit or roll back together.
- For a transfer between existing accounts, the debit and credit are equal and opposite, preserving the combined wallet balance. Failed operations are audited after the transfer transaction rolls back.
- The authenticated identity determines the sender; a client-supplied `senderId` is not trusted.

## Test Suite & Concurrency Verification

The custom integration suite at [`scripts/concurrency-test.js`](./scripts/concurrency-test.js) creates temporary accounts and verifies simultaneous withdrawals, opposite-direction transfers, idempotency replay and key reuse, audit events, non-negative balances, and conservation of the initial combined balance.

With the API and database running, `npm run test:concurrency` reports:

```text
Concurrency test passed:
- simultaneous double spending allowed exactly one withdrawal
- opposite-direction transfers completed without deadlock
- repeated idempotency key returned the original response
- system invariant preserved: combined balance is 2000
```

The `2000` total is the combined starting balance of the two test accounts; successful transfers must conserve it.

## Load & Stress Testing (k6)

The reported benchmark used **Grafana k6 v2.3.0** with **5 concurrent VUs** over a **50-second ramp-up and sustained run**, exercising authenticated requests to `/api/users/me`, `/api/users`, and `/api/transfers`.

| Metric | Result |
| --- | ---: |
| Total HTTP requests | 496 |
| Throughput | ~9.67 req/s |
| Failed HTTP requests | 0 / 496 (0.00%) |
| Endpoint assertions | 495 / 495 passed (100.00%, HTTP 200) |
| Average latency | 86.55 ms |
| Median latency | 77.62 ms |
| P90 latency | 84.28 ms |
| P95 latency | 97.83 ms |

The reported P95 was below 100 ms for this workload. The endpoint traffic in the repository's current script is read-only; its login request is a one-time POST during setup, followed by authenticated GET requests. It does **not** generate sustained write traffic. These HTTP results show no request failures during the reported run, but do not by themselves establish PostgreSQL connection-pool stability; database-side pool and connection metrics should be captured for that conclusion.

Reported terminal summary (formatted from the benchmark values supplied for this run; the original k6 stdout was not provided):

```text
k6 v2.3.0 — 5 VUs — 50s
http_reqs......................: 496     ~9.67/s
http_req_failed................: 0.00%   0 out of 496
checks.........................: 100.00% 495 out of 495
http_req_duration..............: avg=86.55ms med=77.62ms p(90)=84.28ms p(95)=97.83ms
```

[`scripts/load-test.js`](./scripts/load-test.js) provides a bounded, read-only authenticated API workload for [k6](https://k6.io/). By default it ramps to 5 VUs, sustains that level for 30 seconds, then ramps down; the hard limit is 10 VUs. It records P95 request latency (`http_req_duration`), request throughput (`http_reqs`), and HTTP/application error rates. Transfers are not created by this script.

Install k6 separately, configure credentials for a dedicated test account, and run against localhost:

```powershell
$env:LOAD_TEST_USERNAME = "your-test-user"
$env:LOAD_TEST_PASSWORD = "your-test-password"
k6 run scripts/load-test.js
```

The script only permits localhost by default. To run its bounded workload against this project's Render API, explicitly opt in:

```powershell
$env:BASE_URL = "https://payment-backend-hupa.onrender.com"
$env:LOAD_TEST_ALLOW_REMOTE = "true"
k6 run scripts/load-test.js
```

Use a dedicated test account and an isolated or approved test environment. Record the deployment, database tier, VU profile, and thresholds with each result. The script defines acceptance thresholds but this repository does not claim benchmark numbers.

## Getting Started & API Reference

### Requirements

- Node.js 20 or newer for the API; Node.js 20.19+ or 22.12+ for Vite.
- PostgreSQL locally, or a Supabase project.
- Docker Compose for the local PostgreSQL option.

### Configure the database

For local development, start PostgreSQL:

```sh
docker compose up -d postgres
```

On its first initialization, Docker applies `sql/schema.sql` automatically. To initialize an existing local database, apply the schema explicitly:

```sh
psql "$DATABASE_URL" -f sql/schema.sql
```

For Supabase, open the project's **SQL Editor**, run the contents of [`sql/schema.sql`](./sql/schema.sql), then copy the PostgreSQL connection URI from **Project Settings → Database → Connection string**. Set it as `DATABASE_URL` in the backend `.env`. Use a connection method supported by your environment, require SSL, and keep database credentials out of source control and the frontend.

### Configure and run the backend

Create `.env` from `.env.example` (PowerShell):

```powershell
Copy-Item .env.example .env
```

Then set `DATABASE_URL` and replace `JWT_SECRET` with a cryptographically random value of at least 32 bytes. For example:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Set `CORS_ORIGIN` to the trusted frontend origin(s), comma-separated when there is more than one. In production, `NODE_ENV=production` enables Secure cookies; cross-origin HTTPS sessions use `SameSite=None`. Never commit `.env` or use the included local Compose credentials in production.

Install dependencies and start the API:

```sh
npm install
npm start
```

The API listens on `PORT` (default `3000`). `GET /health` is a liveness check. Start the optional React development client in a second terminal:

```sh
npm --prefix client install
npm run dev:client
```

### Run the concurrency suite

With `.env` configured and the API/database running:

```sh
npm run test:concurrency
```

The test uses `API_URL` when set (otherwise `http://localhost:3000`) and the `DATABASE_URL` from `.env`. It creates temporary users and cleans their test records on completion. Run it only against a database reserved for development or testing.

### API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `POST` | `/api/auth/register` | Register `{ "username": "alice", "password": "at-least-12-chars" }`; creates an account with 1000 units |
| `POST` | `/api/auth/login` | Authenticate with username or email and password |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/users/me` | Get the authenticated account |
| `GET` | `/api/users` | List up to 100 other accounts as transfer recipients |
| `POST` | `/api/transfers` | Transfer `{ "receiverId": 2, "amount": 100 }`; optional UUID `Idempotency-Key` header |
| `GET` | `/api/transfers` | Get the authenticated account's 20 most recent sent or received transfers |

Authenticated routes accept the HttpOnly `token` cookie or an `Authorization: Bearer <token>` header. Login and registration return a token and set the session cookie. Use HTTPS, a strong secret, a specific trusted CORS origin, and least-privilege database credentials in production.
