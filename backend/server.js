
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/prisma/client.ts'
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from './auth-security.js'
import { decimalToUnits, parseMoney, unitsToDecimal } from './money.js'
import { getSystemAccount } from './system-account.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 4000
const sessionSecret = process.env.JWT_SECRET
const isProduction = process.env.NODE_ENV === 'production'
const sessionCookieName = 'bv_session'
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!sessionSecret || Buffer.byteLength(sessionSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 bytes.')
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured.')
}

// Configure the MariaDB adapter with TLS enabled.
const databaseUrl = new URL(process.env.DATABASE_URL)

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
    ssl: true,
    connectionLimit: 5,
  }),
})

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '10kb' }))
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Try again later.' },
})
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Try again later.' },
})
const onboardingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many account requests. Try again later.' },
})
const transferLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many transfer attempts. Try again later.' },
})
const transactionSelect = {
  id: true,
  type: true,
  status: true,
  amount: true,
  currency: true,
  description: true,
  createdAt: true,
  completedAt: true,
  sourceAccount: { select: { accountNumber: true, type: true } },
  destinationAccount: { select: { accountNumber: true, type: true } },
}

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return null
  }

  const normalized = email.trim().toLowerCase()
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null
}

function getPasswordError(password) {
  if (typeof password !== 'string') {
    return 'Password is required.'
  }

  const length = Array.from(password).length
  if (length < 12 || length > 128) {
    return 'Password must be between 12 and 128 characters.'
  }

  return null
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  }
}

function setSessionCookie(res, token, maxAge) {
  const attributes = [
    `${sessionCookieName}=${token}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ]

  if (isProduction) {
    attributes.push('Secure')
  }

  res.append('Set-Cookie', attributes.join('; '))
}

function clearSessionCookie(res) {
  const attributes = [
    `${sessionCookieName}=`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]

  if (isProduction) {
    attributes.push('Secure')
  }

  res.append('Set-Cookie', attributes.join('; '))
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) {
    return null
  }

  const sessionCookie = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName}=`))

  return sessionCookie ? sessionCookie.slice(sessionCookieName.length + 1) : null
}

function logError(error) {
  console.error('Request failed', {
    name: error && error.name,
    code: error && error.code,
    statusCode: error && error.statusCode,
    message: error && error.message,
    meta: error && error.meta,
    cause: error && error.cause
      ? {
          code: error.cause.code,
          message: error.cause.message,
        }
      : undefined,
  })
  console.dir(error && error.meta && error.meta.driverAdapterError, {
  depth: null,
})
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function getIdempotencyKey(req) {
  const key = req.get('Idempotency-Key')
  return typeof key === 'string' && /^[A-Za-z0-9._:-]{16,128}$/.test(key) ? key : null
}

function hashRequest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function assertBalancedLedger(tx, transactionId) {
  const entries = await tx.ledgerEntry.findMany({
    where: { transactionId },
    select: { type: true, amount: true },
  })

  let debits = 0n
  let credits = 0n
  for (const entry of entries) {
    const amountUnits = decimalToUnits(entry.amount)
    if (amountUnits <= 0n) {
      throw httpError(500, 'Transaction ledger posting failed.')
    }

    if (entry.type === 'DEBIT') {
      debits += amountUnits
    } else {
      credits += amountUnits
    }
  }

  if (entries.length < 2 || debits === 0n || debits !== credits) {
    throw httpError(500, 'Transaction ledger posting failed.')
  }
}

function createAccountNumber() {
  const accountNumberSpace = 9_000_000_000_000_000n
  const randomValue = BigInt(`0x${randomBytes(8).toString('hex')}`)
  return String(1_000_000_000_000_000n + (randomValue % accountNumberSpace))
}

async function findIdempotentTransaction(tx, userId, key, requestHash) {
  let existing = await tx.idempotencyKey.findUnique({
    where: { userId_key: { userId, key } },
    select: { id: true, requestHash: true, transactionId: true, expiresAt: true },
  })

  if (existing?.expiresAt && existing.expiresAt <= new Date()) {
    await tx.idempotencyKey.delete({ where: { id: existing.id } })
    existing = null
  }

  if (!existing) {
    return null
  }

  if (existing.requestHash !== requestHash) {
    throw httpError(409, 'This idempotency key was already used for a different request.')
  }

  if (!existing.transactionId) {
    throw httpError(409, 'This request is already being processed.')
  }

  return tx.transaction.findUnique({
    where: { id: existing.transactionId },
    select: transactionSelect,
  })
}

async function requireAuth(req, res, next) {
  const session = verifySessionToken(getSessionToken(req), sessionSecret)
  if (!session) {
    clearSessionCookie(res)
    return res.status(401).json({ message: 'Authentication required.' })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
    },
  })

  if (!user || !user.isActive) {
    clearSessionCookie(res)
    return res.status(401).json({ message: 'Authentication required.' })
  }

  req.authUser = user
  return next()
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.authUser.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Administrator access required.' })
    }

    return next()
  })
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'BalanceVault API',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ready', database: 'connected' })
  } catch (error) {
    logError(error)
    res.status(503).json({ status: 'not_ready', database: 'unavailable' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  const session = verifySessionToken(getSessionToken(req), sessionSecret)
  if (!session) {
    clearSessionCookie(res)
    return res.status(401).json({ message: 'Authentication required.' })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })

  if (!user || !user.isActive) {
    clearSessionCookie(res)
    return res.status(401).json({ message: 'Authentication required.' })
  }

  return res.json({ user: publicUser(user) })
})

app.get('/api/onboarding', requireAuth, async (req, res) => {
  const [request, accounts] = await Promise.all([
    prisma.onboardingRequest.findFirst({
      where: { userId: req.authUser.id },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNote: true,
        account: {
          select: {
            id: true,
            accountNumber: true,
            type: true,
            status: true,
            currency: true,
            balance: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.account.findMany({
      where: { userId: req.authUser.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        accountNumber: true,
        type: true,
        status: true,
        currency: true,
        balance: true,
        createdAt: true,
      },
    }),
  ])

  return res.json({ request, accounts })
})

app.post('/api/onboarding', requireAuth, onboardingLimiter, async (req, res) => {
  const accountType = req.body?.accountType
  if (accountType !== 'CHECKING' && accountType !== 'SAVINGS') {
    return res.status(400).json({ message: 'Choose a checking or savings account.' })
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const pendingRequest = await tx.onboardingRequest.findFirst({
        where: {
          userId: req.authUser.id,
          status: 'PENDING',
        },
        select: { id: true },
      })

      if (pendingRequest) {
        return { conflict: true }
      }

      const account = await tx.account.create({
        data: {
          accountNumber: createAccountNumber(),
          userId: req.authUser.id,
          type: accountType,
          status: 'PENDING',
        },
        select: {
          id: true,
          accountNumber: true,
          type: true,
          status: true,
          currency: true,
          balance: true,
          createdAt: true,
        },
      })
      const request = await tx.onboardingRequest.create({
        data: { userId: req.authUser.id, accountId: account.id },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          reviewNote: true,
          account: {
            select: {
              id: true,
              accountNumber: true,
              type: true,
              status: true,
              currency: true,
              balance: true,
              createdAt: true,
            },
          },
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: req.authUser.id,
          action: 'ONBOARDING_SUBMITTED',
          targetType: 'OnboardingRequest',
          targetId: request.id,
          outcome: 'SUCCESS',
          metadata: { accountType },
        },
      })

      return { request, accounts: [account] }
    },
    { isolationLevel: 'Serializable' },
  )

  if (result.conflict) {
    return res.status(409).json({ message: 'You already have an onboarding request awaiting review.' })
  }

  return res.status(201).json(result)
})

app.get('/api/admin/onboarding', requireAdmin, async (_req, res) => {
  const requests = await prisma.onboardingRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'asc' },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      applicant: { select: { id: true, fullName: true, email: true } },
      account: {
        select: {
          id: true,
          accountNumber: true,
          type: true,
          status: true,
          currency: true,
          balance: true,
        },
      },
    },
  })

  return res.json({ requests })
})

app.post('/api/admin/onboarding/:requestId/review', requireAdmin, async (req, res) => {
  const decision = req.body?.decision
  const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : ''

  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    return res.status(400).json({ message: 'Choose approve or reject.' })
  }

  if (reviewNote.length > 500 || (decision === 'REJECTED' && !reviewNote)) {
    return res.status(400).json({ message: 'A rejection reason of up to 500 characters is required.' })
  }

  const reviewed = await prisma.$transaction(
    async (tx) => {
      const request = await tx.onboardingRequest.findUnique({
        where: { id: req.params.requestId },
        include: { account: true },
      })

      if (!request) {
        throw httpError(404, 'Onboarding request not found.')
      }

      if (request.status !== 'PENDING' || !request.account || request.account.status !== 'PENDING') {
        throw httpError(409, 'This onboarding request is no longer pending review.')
      }

      const updatedRequest = await tx.onboardingRequest.update({
        where: { id: request.id },
        data: {
          status: decision,
          reviewedAt: new Date(),
          reviewedBy: req.authUser.id,
          reviewNote: reviewNote || null,
        },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          reviewNote: true,
          applicant: { select: { id: true, fullName: true, email: true } },
          account: {
            select: {
              id: true,
              accountNumber: true,
              type: true,
              status: true,
              currency: true,
              balance: true,
            },
          },
        },
      })
      const account = await tx.account.update({
        where: { id: request.account.id },
        data: { status: decision === 'APPROVED' ? 'ACTIVE' : 'CLOSED' },
        select: {
          id: true,
          accountNumber: true,
          type: true,
          status: true,
          currency: true,
          balance: true,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: req.authUser.id,
          action: `ONBOARDING_${decision}`,
          targetType: 'OnboardingRequest',
          targetId: request.id,
          outcome: 'SUCCESS',
          metadata: { accountId: account.id },
        },
      })

      return { request: updatedRequest, account }
    },
    { isolationLevel: 'Serializable' },
  )

  return res.json(reviewed)
})

app.get('/api/admin/accounts', requireAdmin, async (_req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      accountNumber: true,
      type: true,
      status: true,
      currency: true,
      balance: true,
      createdAt: true,
      owner: { select: { id: true, fullName: true, email: true } },
    },
  })

  return res.json({ accounts })
})

app.get('/api/admin/audit-logs', requireAdmin, async (_req, res) => {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      outcome: true,
      metadata: true,
      createdAt: true,
      actor: { select: { fullName: true, email: true } },
    },
  })

  return res.json({ entries })
})

app.get('/api/accounts', requireAuth, async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.authUser.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      accountNumber: true,
      type: true,
      status: true,
      currency: true,
      balance: true,
      createdAt: true,
    },
  })

  return res.json({ accounts })
})

app.get('/api/transactions', requireAuth, async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { initiatedById: req.authUser.id },
        { sourceAccount: { is: { userId: req.authUser.id } } },
        { destinationAccount: { is: { userId: req.authUser.id } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: transactionSelect,
  })

  return res.json({ transactions })
})

app.post('/api/transactions/transfers', requireAuth, transferLimiter, async (req, res) => {
  const sourceAccountNumber =
    typeof req.body?.sourceAccountNumber === 'string' ? req.body.sourceAccountNumber.trim() : ''
  const destinationAccountNumber =
    typeof req.body?.destinationAccountNumber === 'string'
      ? req.body.destinationAccountNumber.trim()
      : ''
  const amountUnits = parseMoney(req.body?.amount)
  const idempotencyKey = getIdempotencyKey(req)

  if (
    !/^\d{16}$/.test(sourceAccountNumber) ||
    !/^\d{16}$/.test(destinationAccountNumber) ||
    !amountUnits ||
    !idempotencyKey
  ) {
    return res.status(400).json({
      message: 'Provide valid 16-digit account numbers, an amount up to $10,000, and an Idempotency-Key header.',
    })
  }

  if (sourceAccountNumber === destinationAccountNumber) {
    return res.status(400).json({ message: 'Choose two different accounts.' })
  }

  const requestHash = hashRequest({
    sourceAccountNumber,
    destinationAccountNumber,
    amount: amountUnits.toString(),
  })
  const amount = unitsToDecimal(amountUnits)

  const result = await prisma.$transaction(
    async (tx) => {
      const previous = await findIdempotentTransaction(
        tx,
        req.authUser.id,
        idempotencyKey,
        requestHash,
      )
      if (previous) {
        return { transaction: previous, replayed: true }
      }

      const [source, destination] = await Promise.all([
        tx.account.findUnique({ where: { accountNumber: sourceAccountNumber } }),
        tx.account.findUnique({ where: { accountNumber: destinationAccountNumber } }),
      ])

      if (!source || source.userId !== req.authUser.id || source.status !== 'ACTIVE') {
        throw httpError(404, 'Source account is unavailable.')
      }

      if (!destination || !destination.userId || destination.status !== 'ACTIVE') {
        throw httpError(404, 'Destination account is unavailable.')
      }

      if (source.currency !== destination.currency) {
        throw httpError(400, 'Transfers require accounts with the same currency.')
      }

      if (decimalToUnits(source.balance) < amountUnits) {
        throw httpError(400, 'The source account has insufficient funds.')
      }

      const debit = await tx.account.updateMany({
        where: {
          id: source.id,
          userId: req.authUser.id,
          status: 'ACTIVE',
          balance: { gte: amount },
        },
        data: { balance: { decrement: amount } },
      })
      if (debit.count !== 1) {
        throw httpError(409, 'The source balance changed. Refresh and retry.')
      }

      const credit = await tx.account.updateMany({
        where: { id: destination.id, status: 'ACTIVE' },
        data: { balance: { increment: amount } },
      })
      if (credit.count !== 1) {
        throw httpError(409, 'The destination account changed. Refresh and retry.')
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          status: 'COMPLETED',
          amount,
          currency: source.currency,
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          initiatedById: req.authUser.id,
          description: `Transfer to account ending ${destinationAccountNumber.slice(-4)}`,
          completedAt: new Date(),
        },
        select: transactionSelect,
      })

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            accountId: source.id,
            type: 'DEBIT',
            amount,
          },
          {
            transactionId: transaction.id,
            accountId: destination.id,
            type: 'CREDIT',
            amount,
          },
        ],
      })
      await assertBalancedLedger(tx, transaction.id)
      await tx.idempotencyKey.create({
        data: {
          userId: req.authUser.id,
          key: idempotencyKey,
          requestHash,
          transactionId: transaction.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      await tx.auditLog.create({
        data: {
          actorId: req.authUser.id,
          action: 'TRANSFER_COMPLETED',
          targetType: 'Transaction',
          targetId: transaction.id,
          outcome: 'SUCCESS',
          metadata: { amount, currency: source.currency },
        },
      })

      return { transaction, replayed: false }
    },
    { isolationLevel: 'Serializable' },
  )

  return res.status(result.replayed ? 200 : 201).json(result)
})

app.post('/api/transactions/withdrawals', requireAuth, transferLimiter, async (req, res) => {
  if (req.authUser.role !== 'ACCOUNT_HOLDER') {
    return res.status(403).json({ message: 'Account holder access required.' })
  }

  const accountNumber =
    typeof req.body?.accountNumber === 'string' ? req.body.accountNumber.trim() : ''
  const amountUnits = parseMoney(req.body?.amount)
  const idempotencyKey = getIdempotencyKey(req)

  if (!/^\d{16}$/.test(accountNumber) || !amountUnits || !idempotencyKey) {
    return res.status(400).json({
      message: 'Provide a valid 16-digit account number, an amount up to $10,000, and an Idempotency-Key header.',
    })
  }

  const requestHash = hashRequest({
    kind: 'simulated-withdrawal',
    accountNumber,
    amount: amountUnits.toString(),
  })
  const amount = unitsToDecimal(amountUnits)

  const result = await prisma.$transaction(
    async (tx) => {
      const previous = await findIdempotentTransaction(
        tx,
        req.authUser.id,
        idempotencyKey,
        requestHash,
      )
      if (previous) {
        return { transaction: previous, replayed: true }
      }

      const account = await tx.account.findUnique({
        where: { accountNumber },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          currency: true,
          balance: true,
        },
      })
      if (
        !account ||
        account.userId !== req.authUser.id ||
        account.type === 'SYSTEM' ||
        account.status !== 'ACTIVE'
      ) {
        throw httpError(404, 'Active account not found.')
      }

      if (decimalToUnits(account.balance) < amountUnits) {
        throw httpError(400, 'The account has insufficient funds.')
      }

      const systemAccount = await getSystemAccount(tx, account.currency)
      const debit = await tx.account.updateMany({
        where: {
          id: account.id,
          userId: req.authUser.id,
          type: { not: 'SYSTEM' },
          status: 'ACTIVE',
          balance: { gte: amount },
        },
        data: { balance: { decrement: amount } },
      })
      if (debit.count !== 1) {
        throw httpError(409, 'The account balance changed. Refresh and retry.')
      }

      const creditSystem = await tx.account.updateMany({
        where: {
          id: systemAccount.id,
          type: 'SYSTEM',
          userId: null,
          status: 'ACTIVE',
          currency: account.currency,
          balance: { gte: amount },
        },
        data: { balance: { decrement: amount } },
      })
      if (creditSystem.count !== 1) {
        throw httpError(409, 'The system clearing balance is insufficient.')
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          amount,
          currency: account.currency,
          sourceAccountId: account.id,
          initiatedById: req.authUser.id,
          description: 'Simulated withdrawal',
          completedAt: new Date(),
        },
        select: transactionSelect,
      })

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            accountId: account.id,
            type: 'DEBIT',
            amount,
          },
          {
            transactionId: transaction.id,
            accountId: systemAccount.id,
            type: 'CREDIT',
            amount,
          },
        ],
      })
      await assertBalancedLedger(tx, transaction.id)
      await tx.idempotencyKey.create({
        data: {
          userId: req.authUser.id,
          key: idempotencyKey,
          requestHash,
          transactionId: transaction.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      await tx.auditLog.create({
        data: {
          actorId: req.authUser.id,
          action: 'WITHDRAWAL_COMPLETED',
          targetType: 'Transaction',
          targetId: transaction.id,
          outcome: 'SUCCESS',
          metadata: { accountId: account.id, amount, currency: account.currency },
        },
      })

      return { transaction, replayed: false }
    },
    { isolationLevel: 'Serializable' },
  )

  return res.status(result.replayed ? 200 : 201).json(result)
})

app.post('/api/admin/accounts/:accountId/deposits', requireAdmin, async (req, res) => {
  const amountUnits = parseMoney(req.body?.amount)
  const idempotencyKey = getIdempotencyKey(req)
  if (!amountUnits || !idempotencyKey) {
    return res.status(400).json({
      message: 'Provide an amount up to $10,000 and an Idempotency-Key header.',
    })
  }

  const amount = unitsToDecimal(amountUnits)
  const requestHash = hashRequest({
    kind: 'simulated-deposit',
    accountId: req.params.accountId,
    amount: amountUnits.toString(),
  })

  const result = await prisma.$transaction(
    async (tx) => {
      const previous = await findIdempotentTransaction(
        tx,
        req.authUser.id,
        idempotencyKey,
        requestHash,
      )
      if (previous) {
        return { transaction: previous, replayed: true }
      }

      const account = await tx.account.findUnique({
        where: { id: req.params.accountId },
        select: { id: true, userId: true, type: true, status: true, currency: true },
      })
      if (
        !account ||
        !account.userId ||
        account.type === 'SYSTEM' ||
        account.status !== 'ACTIVE'
      ) {
        throw httpError(404, 'Active account not found.')
      }

      const systemAccount = await getSystemAccount(tx, account.currency)
      const credit = await tx.account.updateMany({
        where: {
          id: account.id,
          userId: account.userId,
          type: { not: 'SYSTEM' },
          status: 'ACTIVE',
          currency: account.currency,
        },
        data: { balance: { increment: amount } },
      })
      if (credit.count !== 1) {
        throw httpError(409, 'The account changed. Refresh and retry.')
      }

      const debitSystem = await tx.account.updateMany({
        where: {
          id: systemAccount.id,
          type: 'SYSTEM',
          userId: null,
          status: 'ACTIVE',
          currency: account.currency,
        },
        data: { balance: { increment: amount } },
      })
      if (debitSystem.count !== 1) {
        throw httpError(409, 'The system clearing account changed.')
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount,
          currency: account.currency,
          destinationAccountId: account.id,
          initiatedById: req.authUser.id,
          description: 'Simulated demo funding',
          completedAt: new Date(),
        },
        select: transactionSelect,
      })

      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            accountId: systemAccount.id,
            type: 'DEBIT',
            amount,
          },
          {
            transactionId: transaction.id,
            accountId: account.id,
            type: 'CREDIT',
            amount,
          },
        ],
      })
      await assertBalancedLedger(tx, transaction.id)
      await tx.idempotencyKey.create({
        data: {
          userId: req.authUser.id,
          key: idempotencyKey,
          requestHash,
          transactionId: transaction.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      await tx.auditLog.create({
        data: {
          actorId: req.authUser.id,
          action: 'DEMO_DEPOSIT',
          targetType: 'Transaction',
          targetId: transaction.id,
          outcome: 'SUCCESS',
          metadata: { accountId: account.id, amount, currency: account.currency },
        },
      })

      return { transaction, replayed: false }
    },
    { isolationLevel: 'Serializable' },
  )

  return res.status(result.replayed ? 200 : 201).json(result)
})

app.post('/api/auth/register', registrationLimiter, async (req, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : ''
  const email = normalizeEmail(req.body?.email)
  const passwordError = getPasswordError(req.body?.password)

  if (!fullName || fullName.length > 120 || !email || passwordError) {
    return res.status(400).json({
      message: passwordError || 'Enter a valid name and email address.',
    })
  }

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: await hashPassword(req.body.password),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  })

  const sessionDuration = 60 * 60
  const token = createSessionToken(user.id, sessionSecret, sessionDuration)
  setSessionCookie(res, token, sessionDuration)

  return res.status(201).json({ user: publicUser(user) })
})

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = req.body?.password

  if (!email || typeof password !== 'string' || password.length > 512) {
    return res.status(400).json({ message: 'Enter a valid email address and password.' })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
      createdAt: true,
    },
  })

  let passwordMatches = false
  if (user) {
    passwordMatches = await verifyPassword(password, user.passwordHash)
  } else {
    await hashPassword(password)
  }

  if (!user || !user.isActive || !passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }

  const sessionDuration = req.body?.rememberMe === true ? 30 * 24 * 60 * 60 : 60 * 60
  const token = createSessionToken(user.id, sessionSecret, sessionDuration)
  setSessionCookie(res, token, sessionDuration)

  return res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res)
  return res.status(204).end()
})

app.use((error, _req, res, _next) => {
  if (error && error.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed by CORS' })
  }

  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large.' })
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Request body must be valid JSON.' })
  }

  if (error && Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 600) {
    return res.status(error.statusCode).json({ message: error.message })
  }

  if (error && error.code === 'P2002') {
    return res.status(409).json({ message: 'The request conflicts with an existing record.' })
  }

  if (error && error.code === 'P2034') {
    return res.status(409).json({ message: 'The account request changed concurrently. Please retry.' })
  }

  logError(error)
  return res.status(500).json({ message: 'Unexpected server error.' })
})

async function start() {
  await prisma.$connect()

  const server = app.listen(port, () => {
    console.log(`BalanceVault backend listening on http://localhost:${port}`)
  })

  const shutdown = () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((error) => {
    logError(error)
    process.exitCode = 1
  })
}

export { app, prisma }
