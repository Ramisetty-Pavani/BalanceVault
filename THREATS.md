# BalanceVault Threat Model

**Review date:** 2026-11-12

**Scope:** The local simulated-banking application and its current tests. This is a code-based threat model, not a penetration test or a review of a live deployment.

## System and assets

BalanceVault consists of a React/Vite frontend, an Express API, and a MySQL-compatible database accessed through Prisma. It supports account registration and onboarding, administrator review, simulated deposits, withdrawals and transfers, transaction records, ledger entries, audit logs, and idempotency keys.

Assets to protect:

- User passwords, session tokens, email addresses, and account details.
- Account balances, completed transactions, ledger entries, and audit history.
- Administrator privileges and onboarding decisions.
- Database credentials and the session-signing secret.
- Availability and correctness of the API.

Trust boundaries:

1. A user's browser communicates with the API over the network.
2. The API authenticates users and applies role and account-ownership checks.
3. The API and Prisma access the database using server-side configuration.
4. Administrators can perform privileged onboarding and simulated funding actions.
5. The system clearing account represents demo funds only; it is not connected to a bank or payment network.

## Threats, controls, and evidence

| Threat | Potential impact | Current controls | Test evidence and remaining limits |
|---|---|---|---|
| Password guessing or stolen credentials | Account takeover | Passwords use salted scrypt hashes; login and registration routes have rate limits; login errors do not distinguish unknown users from wrong passwords. | Unit test: `password hashes are salted and verify only the original password`. Rate limits use an in-process store, so they are not a shared limit across multiple server instances. No MFA is implemented. |
| Forged, expired, or stolen session | Unauthorized account actions | HMAC-signed sessions are verified with expiry and issuer checks. Cookies are HttpOnly and SameSite Strict, and Secure in production. Authenticated requests reload the active user and role from the database. | Unit test: `session tokens reject tampering and expiration`. Open limitation: logout clears the browser cookie but does not revoke a copied token server-side; “remember me” sessions can last 30 days. |
| Account-holder privilege escalation | Unauthorized admin actions or withdrawals | Public registration relies on the schema's `ACCOUNT_HOLDER` default; admin APIs use role checks. Withdrawals explicitly require `ACCOUNT_HOLDER`. | Integration tests cover non-admin deposit rejection, SYSTEM-account deposit rejection, and ADMIN withdrawal rejection. |
| Insecure direct object reference (IDOR) | Reading or moving another user's funds | Account queries and transaction updates check ownership; SYSTEM accounts are not customer accounts. | Integration test: `a user cannot withdraw from another owner account`. Transfer tests exercise source ownership; the suite does not exhaustively test every account-access route. |
| Overdrafts, race conditions, or partial financial writes | Incorrect balances or unbalanced transaction records | Decimal-safe parsing; conditional balance updates; Serializable database transactions; each posting writes its transaction, ledger entries, idempotency record, and audit record together; debit and credit totals are checked before commit. | Integration tests cover insufficient balance, concurrent withdrawals, balanced deposits/withdrawals/transfers, and transaction rollback. These tests run against the dedicated local test database, not a live deployment. |
| Replayed or altered transaction requests | Duplicate or misdirected postings | Idempotency keys are scoped to the initiating user and paired with a request hash. Reusing a key with a different request conflicts. | Integration tests cover deposit replay/conflict and withdrawal replay. Keys expire after 24 hours. |
| Modification or deletion of ledger and audit records | Loss of financial evidence or altered history | A migration adds database triggers rejecting ordinary UPDATE and DELETE operations on `LedgerEntry` and `AuditLog`; deleting a user referenced by an audit record is restricted. | Integration test: `ledger entries and audit logs reject updates and deletes`. A privileged database administrator can still alter the schema or use operations such as TRUNCATE; production database privileges and backups remain important. |
| System-account misuse | Funding the clearing account as though it belonged to a customer, or duplicate clearing accounts | The system account is distinguished by type, is not user-owned, is provisioned idempotently, and provisioning refuses to create it when financial data already exists. | Integration tests cover idempotent provisioning and rejection of a deposit targeting a SYSTEM account. The seed command must only be run against the intended database. |
| Cross-origin requests or session abuse | Unauthorized browser-triggered actions | The API uses an origin allowlist with credentialed CORS and SameSite Strict cookies. JSON request bodies are size-limited. | The cookie-path integration test confirms the cookie reaches API routes. There is no separate CSRF token; CORS is not an authorization control. Production origins and cookie behavior must be tested with the actual deployed domains. |
| Unnecessary disclosure of account information | Counterparty account-number exposure | User responses exclude password hashes and account APIs scope account data to the owner. | Open limitation: transaction responses include full source and destination account numbers, which may expose a counterparty's number in transaction history. |
| Service abuse or resource exhaustion | Degraded availability | Express rate limits are applied to authentication, onboarding, transfers, and withdrawals; JSON bodies are limited to 10 KB. | No load or denial-of-service test has been run. In-memory rate limiting is not coordinated across multiple instances. |

## Validation boundary and residual risk

The backend unit tests, 13 integration tests, Prisma validation, frontend lint, and frontend production build passed locally. The integration suite uses only the local `balancevault_test_db`; its fixtures are synthetic. These results do not prove that a hosted database, Render configuration, custom domain, or live deployment works.

All deposits, withdrawals, and transfers are simulations. The application does not connect to real payment networks and must not be used to hold or move real money. Before any public deployment, configure secrets through the hosting provider, use a hosted MySQL-compatible database, apply migrations deliberately, verify CORS and cookie behavior, and test the deployed application. Do not expose credentials in this document.
