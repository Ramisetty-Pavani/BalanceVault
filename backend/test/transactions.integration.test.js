import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createSessionToken } from '../auth-security.js'
import { decimalToUnits } from '../money.js'
import { ensureSystemAccount } from '../system-account.js'

function getTestDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL
  if (!value) {
    throw new Error('TEST_DATABASE_URL must point to a dedicated local test database.')
  }

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('TEST_DATABASE_URL is invalid.')
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (
    url.protocol !== 'mysql:' ||
    !localHosts.has(url.hostname.toLowerCase()) ||
    databaseName !== 'balancevault_test_db' ||
    databaseName === 'balancevault_db' ||
    /prod|production/i.test(`${url.hostname}/${databaseName}`)
  ) {
    throw new Error(
      'Integration tests only run against the local balancevault_test_db database.',
    )
  }

  return value
}

const testDatabaseUrl = getTestDatabaseUrl()
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = testDatabaseUrl
process.env.JWT_SECRET = randomBytes(32).toString('hex')
process.env.CORS_ORIGIN = 'http://localhost'

const { app, prisma } = await import('../server.js')

let server
let baseUrl

before(async () => {
  await prisma.$connect()
  await prisma.$transaction(
    (tx) => ensureSystemAccount(tx),
    { isolationLevel: 'Serializable' },
  )

  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await prisma.$disconnect()
})

function createKey() {
  return randomUUID()
}

async function createUser(role = 'ACCOUNT_HOLDER') {
  return prisma.user.create({
    data: {
      fullName: 'BalanceVault integration test',
      email: `test-${randomUUID()}@balancevault.invalid`,
      passwordHash: 'integration-test-only',
      role,
    },
    select: { id: true, email: true, role: true },
  })
}

async function createActiveAccount(userId, balance = '0.00') {
  const accountNumber = String(
    1_000_000_000_000_000n +
      (BigInt(`0x${randomBytes(8).toString('hex')}`) % 9_000_000_000_000_000n),
  )
  return prisma.account.create({
    data: {
      accountNumber,
      userId,
      type: 'CHECKING',
      status: 'ACTIVE',
      currency: 'USD',
      balance,
    },
  })
}

async function postAs(userId, path, body, idempotencyKey) {
  const token = createSessionToken(userId, process.env.JWT_SECRET, 3600)
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `bv_session=${token}`,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })

  return { response, result: await response.json() }
}

async function depositAs(adminId, account, amount, key = createKey()) {
  return postAs(
    adminId,
    `/api/admin/accounts/${account.id}/deposits`,
    { amount },
    key,
  )
}

async function getSystemAccount() {
  return prisma.account.findFirst({ where: { type: 'SYSTEM' } })
}

async function assertTransactionIsBalanced(transactionId) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { transactionId },
    select: { type: true, amount: true },
  })
  const debits = entries
    .filter((entry) => entry.type === 'DEBIT')
    .reduce((total, entry) => total + decimalToUnits(entry.amount), 0n)
  const credits = entries
    .filter((entry) => entry.type === 'CREDIT')
    .reduce((total, entry) => total + decimalToUnits(entry.amount), 0n)

  assert.ok(entries.length >= 2)
  assert.ok(debits > 0n)
  assert.equal(debits, credits)
}

test('system account provisioning is idempotent and creates no duplicate', async () => {
  const first = await prisma.$transaction((tx) => ensureSystemAccount(tx))
  const second = await prisma.$transaction((tx) => ensureSystemAccount(tx))
  const count = await prisma.account.count({ where: { type: 'SYSTEM' } })

  assert.equal(first.id, second.id)
  assert.equal(count, 1)
})

test('registration sets a cookie usable by all API routes', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Cookie path integration test',
      email: `cookie-${randomUUID()}@balancevault.invalid`,
      password: 'Test Password 123!',
    }),
  })

  assert.equal(response.status, 201)
  assert.match(response.headers.get('set-cookie') || '', /Path=\/api(?:;|$)/)
})

test('simulated deposit credits the user and debits the system account', async () => {
  const admin = await createUser('ADMIN')
  const owner = await createUser()
  const account = await createActiveAccount(owner.id)
  const system = await getSystemAccount()
  const amountUnits = decimalToUnits('12.34')
  const systemBalanceBefore = decimalToUnits(system.balance)

  const { response, result } = await depositAs(admin.id, account, '12.34')

  assert.equal(response.status, 201)
  assert.equal(result.transaction.type, 'DEPOSIT')
  assert.equal(result.replayed, false)
  assert.equal(decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance), amountUnits)
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: system.id } })).balance),
    systemBalanceBefore + amountUnits,
  )
  await assertTransactionIsBalanced(result.transaction.id)

  const entries = await prisma.ledgerEntry.findMany({
    where: { transactionId: result.transaction.id },
    select: { accountId: true, type: true },
  })
  assert.deepEqual(
    entries
      .map(({ accountId, type }) => ({ accountId, type }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    [
      { accountId: account.id, type: 'CREDIT' },
      { accountId: system.id, type: 'DEBIT' },
    ],
  )
})

test('duplicate deposit keys replay without applying funds twice', async () => {
  const admin = await createUser('ADMIN')
  const owner = await createUser()
  const account = await createActiveAccount(owner.id)
  const key = createKey()

  const first = await depositAs(admin.id, account, '25.00', key)
  const replay = await depositAs(admin.id, account, '25.00', key)
  const conflict = await depositAs(admin.id, account, '26.00', key)
  const storedAccount = await prisma.account.findUnique({ where: { id: account.id } })

  assert.equal(first.response.status, 201)
  assert.equal(replay.response.status, 200)
  assert.equal(replay.result.replayed, true)
  assert.equal(replay.result.transaction.id, first.result.transaction.id)
  assert.equal(conflict.response.status, 409)
  assert.equal(decimalToUnits(storedAccount.balance), decimalToUnits('25.00'))
  await assertTransactionIsBalanced(first.result.transaction.id)
})

test('admin deposits remain protected and cannot target a system account', async () => {
  const accountHolder = await createUser()
  const admin = await createUser('ADMIN')
  const account = await createActiveAccount(accountHolder.id)
  const system = await getSystemAccount()
  const systemBalanceBefore = decimalToUnits(system.balance)

  const nonAdminDeposit = await depositAs(accountHolder.id, account, '5.00')
  const systemDeposit = await depositAs(admin.id, system, '5.00')

  assert.equal(nonAdminDeposit.response.status, 403)
  assert.equal(systemDeposit.response.status, 404)
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: system.id } })).balance),
    systemBalanceBefore,
  )
})

test('an account holder can withdraw from their own active account', async () => {
  const admin = await createUser('ADMIN')
  const owner = await createUser()
  const account = await createActiveAccount(owner.id)
  const system = await getSystemAccount()
  const systemBalanceBefore = decimalToUnits(system.balance)
  const funding = await depositAs(admin.id, account, '100.00')
  assert.equal(funding.response.status, 201)

  const key = createKey()
  const first = await postAs(
    owner.id,
    '/api/transactions/withdrawals',
    { accountNumber: account.accountNumber, amount: '25.00' },
    key,
  )
  const replay = await postAs(
    owner.id,
    '/api/transactions/withdrawals',
    { accountNumber: account.accountNumber, amount: '25.00' },
    key,
  )

  assert.equal(first.response.status, 201)
  assert.equal(first.result.transaction.type, 'WITHDRAWAL')
  assert.equal(replay.response.status, 200)
  assert.equal(replay.result.replayed, true)
  assert.equal(replay.result.transaction.id, first.result.transaction.id)
  assert.equal(decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance), decimalToUnits('75.00'))
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: system.id } })).balance),
    systemBalanceBefore + decimalToUnits('75.00'),
  )
  await assertTransactionIsBalanced(first.result.transaction.id)

  const audit = await prisma.auditLog.findFirst({
    where: { action: 'WITHDRAWAL_COMPLETED', targetId: first.result.transaction.id },
  })
  assert.ok(audit)
})

test('a user cannot withdraw from another owner account', async () => {
  const owner = await createUser()
  const otherUser = await createUser()
  const account = await createActiveAccount(owner.id, '10.00')

  const { response } = await postAs(
    otherUser.id,
    '/api/transactions/withdrawals',
    { accountNumber: account.accountNumber, amount: '1.00' },
    createKey(),
  )

  assert.equal(response.status, 404)
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance),
    decimalToUnits('10.00'),
  )
})

test('administrators cannot withdraw through the account holder endpoint', async () => {
  const admin = await createUser('ADMIN')
  const account = await createActiveAccount(admin.id, '10.00')

  const { response } = await postAs(
    admin.id,
    '/api/transactions/withdrawals',
    { accountNumber: account.accountNumber, amount: '1.00' },
    createKey(),
  )

  assert.equal(response.status, 403)
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance),
    decimalToUnits('10.00'),
  )
  assert.equal(await prisma.transaction.count({ where: { sourceAccountId: account.id } }), 0)
})

test('insufficient balance rejects a withdrawal without posting records', async () => {
  const owner = await createUser()
  const account = await createActiveAccount(owner.id, '5.00')
  const before = {
    transactions: await prisma.transaction.count({ where: { initiatedById: owner.id } }),
    entries: await prisma.ledgerEntry.count({ where: { accountId: account.id } }),
    idempotency: await prisma.idempotencyKey.count({ where: { userId: owner.id } }),
    audit: await prisma.auditLog.count({ where: { actorId: owner.id } }),
  }

  const { response } = await postAs(
    owner.id,
    '/api/transactions/withdrawals',
    { accountNumber: account.accountNumber, amount: '6.00' },
    createKey(),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(
    {
      transactions: await prisma.transaction.count({ where: { initiatedById: owner.id } }),
      entries: await prisma.ledgerEntry.count({ where: { accountId: account.id } }),
      idempotency: await prisma.idempotencyKey.count({ where: { userId: owner.id } }),
      audit: await prisma.auditLog.count({ where: { actorId: owner.id } }),
    },
    before,
  )
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance),
    decimalToUnits('5.00'),
  )
})

test('a later ledger constraint failure rolls back the earlier balance update', async () => {
  const owner = await createUser()
  const account = await createActiveAccount(owner.id, '10.00')

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: '2.00' } },
      })
      await tx.ledgerEntry.create({
        data: {
          transactionId: 'missing-test-transaction',
          accountId: account.id,
          type: 'DEBIT',
          amount: '2.00',
        },
      })
    }),
    (error) => error.code === 'P2003',
  )

  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance),
    decimalToUnits('10.00'),
  )
})

test('ledger entries and audit logs reject updates and deletes', async () => {
  const owner = await createUser()
  const recipient = await createUser()
  const source = await createActiveAccount(owner.id)
  const destination = await createActiveAccount(recipient.id)
  const transaction = await prisma.transaction.create({
    data: {
      type: 'TRANSFER',
      status: 'COMPLETED',
      amount: '1.00',
      currency: 'USD',
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      initiatedById: owner.id,
      completedAt: new Date(),
    },
  })
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: transaction.id, accountId: source.id, type: 'DEBIT', amount: '1.00' },
      {
        transactionId: transaction.id,
        accountId: destination.id,
        type: 'CREDIT',
        amount: '1.00',
      },
    ],
  })
  const entries = await prisma.ledgerEntry.findMany({
    where: { transactionId: transaction.id },
    orderBy: { type: 'asc' },
  })
  const audit = await prisma.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'TRANSFER_COMPLETED',
      targetType: 'Transaction',
      targetId: transaction.id,
      outcome: 'SUCCESS',
    },
  })

  await assert.rejects(
    prisma.ledgerEntry.update({
      where: { id: entries[0].id },
      data: { amount: '2.00' },
    }),
  )
  await assert.rejects(prisma.ledgerEntry.delete({ where: { id: entries[0].id } }))
  await assert.rejects(
    prisma.auditLog.update({
      where: { id: audit.id },
      data: { action: 'ALTERED' },
    }),
  )
  await assert.rejects(prisma.auditLog.delete({ where: { id: audit.id } }))

  assert.equal(await prisma.ledgerEntry.count({ where: { transactionId: transaction.id } }), 2)
  assert.equal(
    decimalToUnits((await prisma.ledgerEntry.findUnique({ where: { id: entries[0].id } })).amount),
    decimalToUnits('1.00'),
  )
  assert.equal((await prisma.auditLog.findUnique({ where: { id: audit.id } })).action, 'TRANSFER_COMPLETED')
})

test('concurrent withdrawals cannot overdraw an account', async () => {
  const admin = await createUser('ADMIN')
  const owner = await createUser()
  const account = await createActiveAccount(owner.id)
  const system = await getSystemAccount()
  const systemBalanceBefore = decimalToUnits(system.balance)
  const funding = await depositAs(admin.id, account, '100.00')
  assert.equal(funding.response.status, 201)

  const withdraw = (key) =>
    postAs(
      owner.id,
      '/api/transactions/withdrawals',
      { accountNumber: account.accountNumber, amount: '80.00' },
      key,
    )
  const results = await Promise.all([withdraw(createKey()), withdraw(createKey())])
  const statuses = results.map(({ response }) => response.status)
  const successful = results.filter(({ response }) => response.status === 201)
  const rejected = results.filter(({ response }) => [400, 409].includes(response.status))

  assert.equal(successful.length, 1)
  assert.equal(rejected.length, 1)
  assert.ok(statuses.every((status) => [201, 400, 409].includes(status)))
  assert.equal(decimalToUnits((await prisma.account.findUnique({ where: { id: account.id } })).balance), decimalToUnits('20.00'))
  assert.equal(
    decimalToUnits((await prisma.account.findUnique({ where: { id: system.id } })).balance),
    systemBalanceBefore + decimalToUnits('20.00'),
  )
  const withdrawals = await prisma.transaction.findMany({
    where: { type: 'WITHDRAWAL', sourceAccountId: account.id },
    select: { id: true },
  })
  assert.equal(withdrawals.length, 1)
  await assertTransactionIsBalanced(withdrawals[0].id)
})

test('existing transfers still move funds with a balanced ledger', async () => {
  const admin = await createUser('ADMIN')
  const owner = await createUser()
  const recipient = await createUser()
  const source = await createActiveAccount(owner.id)
  const destination = await createActiveAccount(recipient.id)
  const funding = await depositAs(admin.id, source, '40.00')
  assert.equal(funding.response.status, 201)

  const { response, result } = await postAs(
    owner.id,
    '/api/transactions/transfers',
    {
      sourceAccountNumber: source.accountNumber,
      destinationAccountNumber: destination.accountNumber,
      amount: '15.00',
    },
    createKey(),
  )

  assert.equal(response.status, 201)
  assert.equal(result.transaction.type, 'TRANSFER')
  assert.equal(decimalToUnits((await prisma.account.findUnique({ where: { id: source.id } })).balance), decimalToUnits('25.00'))
  assert.equal(decimalToUnits((await prisma.account.findUnique({ where: { id: destination.id } })).balance), decimalToUnits('15.00'))
  await assertTransactionIsBalanced(result.transaction.id)
})
