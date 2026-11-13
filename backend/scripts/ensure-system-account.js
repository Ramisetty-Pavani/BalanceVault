import dotenv from 'dotenv'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.ts'
import { ensureSystemAccount } from '../system-account.js'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be configured.')
  process.exitCode = 1
} else {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL),
  })

  try {
    let account
    try {
      account = await prisma.$transaction(
        (tx) => ensureSystemAccount(tx),
        { isolationLevel: 'Serializable' },
      )
    } catch (error) {
      if (!error || (error.code !== 'P2002' && error.code !== 'P2034')) {
        throw error
      }

      const existing = await prisma.account.findMany({
        where: { type: 'SYSTEM' },
        take: 2,
        select: {
          id: true,
          accountNumber: true,
          userId: true,
          type: true,
          status: true,
          currency: true,
          balance: true,
        },
      })
      if (
        existing.length !== 1 ||
        existing[0].userId !== null ||
        existing[0].status !== 'ACTIVE' ||
        existing[0].currency !== 'USD'
      ) {
        throw error
      }

      account = existing[0]
    }

    console.log(`System clearing account is ready for ${account.currency}.`)
  } catch (error) {
    console.error('Unable to provision the system clearing account.', {
      code: error && error.code,
    })
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
