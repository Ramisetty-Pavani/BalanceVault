const SYSTEM_ACCOUNT_NUMBER = '0000000000000000'

async function getSystemAccount(tx, currency) {
  const accounts = await tx.account.findMany({
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
    accounts.length !== 1 ||
    accounts[0].userId !== null ||
    accounts[0].status !== 'ACTIVE' ||
    accounts[0].currency !== currency
  ) {
    throw Object.assign(new Error('System clearing account is not configured.'), {
      statusCode: 503,
    })
  }

  return accounts[0]
}

async function ensureSystemAccount(tx) {
  const accounts = await tx.account.findMany({
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

  if (accounts.length > 1) {
    throw new Error('Multiple system accounts exist; reconcile them before seeding.')
  }

  if (accounts.length === 1) {
    const [existing] = accounts
    if (
      existing.userId !== null ||
      existing.status !== 'ACTIVE' ||
      existing.currency !== 'USD'
    ) {
      throw new Error('The existing system account is not a valid active USD clearing account.')
    }

    return existing
  }

  const [accountCount, transactionCount, ledgerEntryCount] = await Promise.all([
    tx.account.count(),
    tx.transaction.count(),
    tx.ledgerEntry.count(),
  ])
  if (accountCount || transactionCount || ledgerEntryCount) {
    throw new Error('Existing financial data needs reconciliation before creating a system account.')
  }

  const reservedAccountNumber = await tx.account.findUnique({
    where: { accountNumber: SYSTEM_ACCOUNT_NUMBER },
    select: { id: true },
  })
  if (reservedAccountNumber) {
    throw new Error('The reserved system account number is already in use.')
  }

  return tx.account.create({
    data: {
      accountNumber: SYSTEM_ACCOUNT_NUMBER,
      type: 'SYSTEM',
      status: 'ACTIVE',
      currency: 'USD',
    },
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
}

export { ensureSystemAccount, getSystemAccount }
