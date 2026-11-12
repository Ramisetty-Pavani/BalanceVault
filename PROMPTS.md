# AI Use and Prompt Record

**Project:** BalanceVault – Money Movement with a Ledger You Can Prove

**AI Tool Used:** GitHub Copilot in VS Code (Copilot SDK)

This document records the major instructions, prompts, review decisions, errors, and corrections during the development of BalanceVault. The prompts are summarized for readability and are not a complete conversation transcript.

## 1. Representative Prompts and Instructions

### 1.1 Inspect the Existing Project Before Making Changes
I instructed GitHub Copilot to inspect the existing backend server, Prisma schema, database migrations, transaction logic, money-handling utilities, and tests before making changes.

The instructions were to:
- Understand the existing project structure and implementation.
- Avoid unnecessary rewrites or database schema changes.
- Explain the proposed implementation before modifying files.
- Preserve the existing money transfer functionality.

### 1.2 Implement Simulated Banking Transactions
I requested implementation of secure simulated deposit and withdrawal functionality.

The requirements included:
- Allow withdrawals only for authenticated account holders operating on their own approved accounts.
- Implement balanced double-entry records for deposits and withdrawals.
- Use atomic database transactions.
- Prevent duplicate transactions using idempotency.
- Validate transaction amounts and available balances.
- Handle rollback and concurrent withdrawal scenarios.
- Preserve and test the existing transfer functionality.

Real banking networks and actual money transfers were explicitly outside the project scope.

### 1.3 Isolate Database Testing
I instructed Copilot to use a separate local test database named `balancevault_test_db`.

The requirements included:
- Identify the exact error when database setup failed.
- Restrict integration tests to the dedicated local test database.
- Prevent test and seed scripts from running against `balancevault_db` or hosted databases.
- Verify migrations and test data only in the isolated test environment.

### 1.4 Improve Ledger and Audit Record Protection
During security review, I selected the ledger and audit immutability issue for correction.

Copilot implemented:
- Database triggers to block ordinary UPDATE and DELETE operations on ledger and audit records.
- Restrictions on deleting users referenced by audit records.
- Integration tests to verify these protections.

### 1.5 Review Changes Before Publishing to GitHub
Before publishing, I instructed Copilot to:
- Inspect the Git status and review all changes.
- Stage only the intended application files.
- Exclude `.env`, credentials, generated files, and unrelated files.
- Review the staged changes before committing.
- Push only to the existing branch `feature/simulated-banking-mvp`.
- Update the existing pull request without merging or deploying.

I authorized the commit and push after reviewing the staged file list and checks.

## 2. Errors and Corrections

1. **Test database setup error:** The initial Node.js command failed because PowerShell removed embedded SQL quotes when passing the script through `node -e`. The error was diagnosed, and the script was subsequently passed through standard input with database safety checks.

2. **Session cookie path:** Review identified that the cookie path `/api/auth` prevented the browser from sending the session cookie to other API routes. It was corrected to `/api`, and an integration test was added.

3. **Withdrawal role validation:** Review identified that authentication and account ownership checks alone did not explicitly prevent an ADMIN from using the withdrawal endpoint. An explicit `ACCOUNT_HOLDER` role check and a corresponding integration test were added.

4. **Concurrency test improvement:** A tautological assertion was removed. The test now checks meaningful outcomes: one concurrent withdrawal succeeds, the other is rejected, balances remain correct, and only one withdrawal is recorded.

## 3. Testing and Verification

The following local verification results were recorded:

- Backend unit tests: **4/4 passed**
- Backend integration tests: **13/13 passed**
- Prisma schema validation: Passed
- Frontend lint: Passed
- Frontend production build: Passed
- Database migration status in the dedicated test database: Verified
- Git diff and staged changes checks: Passed

Integration tests were performed using the dedicated local test database.

These results do not represent a production deployment, external penetration test, or complete security audit.

## 4. GitHub Publishing Details

- **Repository:** https://github.com/Ramisetty-Pavani/BalanceVault
- **Branch:** `feature/simulated-banking-mvp`
- **Commit message:** `feat: complete simulated banking transactions and ledger protections`
- **Pull Request:** https://github.com/Ramisetty-Pavani/BalanceVault/pull/1
- **Status:** Changes pushed successfully; pull request remains open and unmerged.
- **Deployment:** Not performed.

## 5. AI Usage Disclosure

GitHub Copilot was used as an AI-assisted development tool for code inspection, implementation assistance, debugging, test creation, and security review.

I provided the requirements, reviewed proposed changes, made implementation and security decisions, and verified the reported test results. The implementation details and testing outcomes should be understood in the context of this AI-assisted workflow.

Before submitting this project, I will review the implementation and ensure that I can explain the important design decisions, transaction logic, database protections, and tests.

No credentials, passwords, API keys, or `.env` contents are included in this document.