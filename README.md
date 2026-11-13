# BalanceVault

BalanceVault is a simulated banking application developed for learning and demonstration. It allows users to manage account requests, view account information, and perform simulated money movements through a digital ledger.

**Live Website:** https://balancevault-frontend-p4k7.onrender.com

**GitHub Repository:** https://github.com/Ramisetty-Pavani/BalanceVault

## Technologies Used

- Frontend: React, Vite, JavaScript
- Backend: Node.js, Express.js
- Database: MySQL / MariaDB
- ORM: Prisma
- Authentication: Password hashing and HttpOnly session cookies
- Deployment: Render

## Features

- User registration and login with hashed passwords and secure sessions.
- Checking and savings account requests with administrator approval.
- Account dashboard and transaction history.
- Internal transfers and simulated withdrawals.
- Administrator-only simulated funding and account approval.
- Double-entry ledger records and audit events.

## Development Status

The frontend and backend are deployed on Render. User login and the account dashboard are working.

Some features, including administrator approval, money transfers, and transaction verification, are still being tested and improved.

All banking operations are simulated. The application does not connect to real banks or payment networks and must not be used to handle real money.

## Local Setup

**Requirements:** Node.js 22.18 or newer and a MySQL-compatible database.

1. Copy `backend/.env.example` to `backend/.env`.
2. Configure `DATABASE_URL` and a secure `JWT_SECRET` of at least 32 cryptographically random bytes.
3. Open the `backend` folder and run:

```bash
npm ci
npx prisma migrate deploy
```

4. On a new, empty database, initialize the system account:

```bash
npm run seed:system-account
```

5. Start the backend:

```bash
npm run dev
```

6. Open another terminal, navigate to `frontend`, and run:

```bash
npm ci
npm run dev
```

The frontend defaults to `http://localhost:4000` for the API. Set `VITE_API_URL` if the backend is hosted elsewhere.

To create an administrator, first register an ordinary user, then run this command from the backend folder:

```powershell
npm run admin:promote -- user@example.com
```

## Tests

Run backend unit tests from the `backend` folder:

```bash
npm test
```

Integration tests require `TEST_DATABASE_URL` to point to the dedicated local `balancevault_test_db` database. Apply migrations before running:

```bash
npm run test:integration
```

Run frontend checks from the `frontend` folder:

```bash
npm run lint
npm run build
```

## Documentation

- [Threat Model](./THREATS.md)
- [AI Use and Prompt Record](./PROMPTS.md)