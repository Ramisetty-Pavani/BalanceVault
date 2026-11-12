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
- Administrator-only simulated demo funding and onboarding review

## Local setup

Requirements: Node.js 22.18 or newer and a MySQL-compatible database.

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to your MySQL connection string and replace `JWT_SECRET`
   with at least 32 cryptographically random bytes.
3. In `backend`, run `npm ci`, then `npx prisma migrate deploy`, then
   `npm run dev`.
4. In `frontend`, run `npm ci`, then `npm run dev`. The frontend defaults to the
   API at `http://localhost:4000`; set `VITE_API_URL` if it is hosted elsewhere.

Create an ordinary user through the registration page, then promote that user
to administrator from `backend`:

```powershell
npm run admin:promote -- user@example.com
```

Only administrators can approve or reject account requests and add simulated
demo funds. Account requests create pending accounts; approved accounts become
active. Transfers are limited to active accounts in the same currency and
$10,000 per transaction.

## Validation

Run backend tests with `npm test` from `backend`, and frontend checks with
`npm run lint` and `npm run build` from `frontend`.

Render deployment is intentionally separate from this local setup. The current
schema uses MySQL; Render deployment will require an externally hosted MySQL
database and its connection URL configured as a secret environment variable.
