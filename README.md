# BalanceVault

BalanceVault is a simulated banking MVP for learning and demonstration. It does
not connect to real banks, payment networks, or KYC/AML providers and must not
be used to hold or move real money.

## Features

- Account registration and login with hashed passwords and HttpOnly sessions
- Checking and savings account requests with administrator approval
- Account dashboard and transaction history
- Internal transfers with decimal-safe amounts, double-entry ledger records,
  audit events, and idempotency keys
- Simulated withdrawals from the account holder's own active account
- Administrator-only simulated demo funding and onboarding review
- Balanced double-entry postings between customer accounts and a system clearing account

## Local setup

Requirements: Node.js 22.18 or newer and a MySQL-compatible database.

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to your MySQL connection string and replace `JWT_SECRET`
   with at least 32 cryptographically random bytes.
3. In `backend`, run `npm ci`, then `npx prisma migrate deploy`. On a new,
   empty database, run `npm run seed:system-account` before creating accounts.
   The seed command refuses to create a clearing account when financial records
   already exist and never reconciles or deletes existing data.
4. Start the backend with `npm run dev`.
5. In `frontend`, run `npm ci`, then `npm run dev`. The frontend defaults to the
   API at `http://localhost:4000`; set `VITE_API_URL` if it is hosted elsewhere.

Create an ordinary user through the registration page, then promote that user
to administrator from `backend`:

```powershell
npm run admin:promote -- user@example.com
```

Only administrators can approve or reject account requests and add simulated
demo funds. Account requests create pending accounts; approved accounts become
active. Transfers and withdrawals require active accounts and are limited to
$10,000 per transaction. All deposits, withdrawals, and transfers are simulated;
no real funds or payment networks are involved.

## Tests

Run backend unit tests with `npm test`. Integration tests require
`TEST_DATABASE_URL` to target the local `balancevault_test_db` database; the
test runner rejects other database names and non-local hosts. Apply the existing
migrations to that dedicated database before running `npm run test:integration`.
Run frontend checks with `npm run lint` and `npm run build`.

## Validation

Run backend tests with `npm test` from `backend`, and frontend checks with
`npm run lint` and `npm run build` from `frontend`.

Render deployment is intentionally separate from this local setup. The current
schema uses MySQL; Render deployment will require an externally hosted MySQL
database and its connection URL configured as a secret environment variable.
