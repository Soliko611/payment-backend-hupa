# Secure Wallet Backend

A small Express/PostgreSQL wallet API using ES modules. Balances are held as integer minor units (the initial balance is `1000`); transfer amounts must be positive safe integers. PostgreSQL stores balances and transfer amounts as `BIGINT`, and the API serializes them as decimal strings to avoid JavaScript precision loss.

## Requirements

- Node.js 20 or newer
- Docker Compose, or a PostgreSQL server you manage

## Setup

1. Start PostgreSQL and initialize the schema:

   ```sh
   docker compose up -d postgres
   ```

   Docker runs `sql/schema.sql` on the database's first initialization. For an existing database, apply it explicitly:

   ```sh
   psql "postgres://wallet:wallet_dev_password@localhost:5432/wallet" -f sql/schema.sql
   ```

2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your database, and replace `JWT_SECRET` with a cryptographically random secret of at least 32 bytes. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`.

3. Install dependencies and start the API:

   ```sh
   npm install
   npm start
   ```

   The API listens on port `3000` by default. `GET /health` is a basic liveness endpoint.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | HS256 signing key; at least 32 bytes |
| `PORT` | No | `3000` | HTTP listen port |
| `JWT_EXPIRES_IN` | No | `1h` | JWT lifetime |
| `COOKIE_SECURE` | No | `false` | Set `true` behind HTTPS in production |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed browser origin |
| `PG_POOL_MAX` | No | `10` | Maximum PostgreSQL pool size |
| `API_URL` | No | `http://localhost:3000` | Base URL used by the concurrency test |

## API

- `POST /api/auth/register` — JSON `{ "username": "alice", "password": "at-least-12-chars" }`; creates a user with 1000 units and returns a session token.
- `POST /api/auth/login` — JSON `{ "username": "alice", "password": "..." }`; returns a session token.
- `POST /api/auth/logout` — clears the session cookie.
- `GET /api/users/me` — authenticated account details.
- `POST /api/transfers` — authenticated JSON `{ "receiverId": 2, "amount": 100 }`. An optional `Idempotency-Key` header must be a UUID. Repeating the same key and payload returns the original response without executing another transfer; reusing a key with a different payload returns `409`. `senderId` is never read from the request; the authenticated identity is the sender.

Authentication accepts either the `token` HttpOnly cookie or an `Authorization: Bearer <token>` header. Token responses include the token for clients that prefer header-based authentication. Configure HTTPS and `COOKIE_SECURE=true` in production. Use a specific trusted `CORS_ORIGIN`; do not use wildcard origins with credentials.

## Architecture and integrity safeguards

- Routes handle protocol wiring and middleware; controllers translate HTTP input/output; services own validation, SQL, and transaction behavior. PostgreSQL pool and environment configuration live under `src/config`.
- Passwords are bcrypt-hashed; JWTs are signed with HS256 and verified with an algorithm allowlist. Auth endpoints are rate-limited, request bodies are size-limited, and Helmet sets common security headers.
- Transfer execution checks the authenticated sender, receiver ID, positive integer amount, and self-transfer restriction. It acquires one dedicated pool client and always releases it.
- Transfers use `BEGIN`/`COMMIT`/`ROLLBACK`. Both account rows are locked with `SELECT ... FOR UPDATE` in ascending user-ID order. Consistent lock ordering prevents opposite-direction transfer deadlocks; row locks prevent concurrent requests from spending the same balance.
- Sender debit, receiver credit, and the transfer audit row are in the same transaction. Any failure rolls all three back. Database constraints independently enforce nonnegative balances, positive amounts, valid users, and different sender/receiver accounts.
- Idempotency records are scoped to the authenticated user and saved in the transfer transaction with the original response body. Successful transfers and idempotent replays are written to `audit_logs`; failures are audited after the transfer transaction rolls back.
- Use TLS to PostgreSQL in production, provision a least-privilege database role, keep secrets outside source control, and back up the database. The included Compose credentials are for local development only.

## Concurrency and double-spending test

With the API and database running and `.env` configured, run:

```sh
npm run test:concurrency
```

The script registers two temporary accounts, verifies that only one of two concurrent withdrawals can spend the available balance, runs opposite-direction transfers concurrently, and retries an identical transfer with the same idempotency key. It checks that the original response is replayed, key reuse with a different payload is rejected, failures are audited, balances remain nonnegative, and the combined balance remains 2000. It also sends a forged `senderId` in request JSON and confirms the authenticated account remains the sender.
