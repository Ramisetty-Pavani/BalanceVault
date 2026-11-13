import dotenv from 'dotenv'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.ts'

dotenv.config()

const email = process.argv[2]?.trim().toLowerCase()

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:promote -- user@example.com')
  process.exitCode = 1
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be configured.')
  process.exitCode = 1
} else {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL),
  })

  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
      select: { email: true },
    })
    console.log(`Administrator access granted to ${user.email}.`)
  } catch (error) {
    console.error(
      error && error.code === 'P2025'
        ? 'No registered user exists with that email.'
        : 'Unable to update the user role.',
    )
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
