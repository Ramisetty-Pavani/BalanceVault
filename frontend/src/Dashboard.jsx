import { useEffect, useState } from 'react'

const DEFAULT_API_URL = import.meta.env.DEV
  ? 'http://localhost:4000'
  : 'https://balancevault-backend-1n8h.onrender.com'
const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '')

async function requestApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const result = response.status === 204 ? null : await response.json()

  if (!response.ok) {
    const error = new Error(result?.message || 'Unable to complete your request.')
    error.status = response.status
    throw error
  }

  return result
}

async function fetchDashboardData(isAdmin) {
  const [onboarding, transactionData] = await Promise.all([
    requestApi('/api/onboarding'),
    requestApi('/api/transactions'),
  ])
  const data = {
    onboarding,
    transactions: transactionData.transactions,
    pendingRequests: [],
    allRequests: [],
    accounts: [],
    auditEntries: [],
    users: [],
  }

  if (isAdmin) {
    const [requestData, accountData, auditData, userData] = await Promise.all([
      requestApi('/api/admin/onboarding'),
      requestApi('/api/admin/accounts'),
      requestApi('/api/admin/audit-logs'),
      requestApi('/api/admin/users'),
    ])
    data.pendingRequests = requestData.requests.filter((request) => request.status === 'PENDING')
    data.allRequests = requestData.requests
    data.accounts = accountData.accounts
    data.auditEntries = auditData.entries
    data.users = userData.users
  }

  return data
}

function formatCurrency(amount, currency) {
  const [whole, fraction = ''] = String(amount).split('.')
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const precision = fraction.padEnd(4, '0').replace(/0+$/, '')
  const displayFraction = precision ? precision.padEnd(2, '0') : '00'

  return `${currency} ${formattedWhole}.${displayFraction}`
}

function isValidAmount(value) {
  const match = /^(0|[1-9]\d{0,4})(?:[.](\d{1,2}))?$/.exec(value)
  if (!match) {
    return false
  }

  const amountInCents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'))
  return amountInCents > 0n && amountInCents <= 1_000_000n
}

function Dashboard({ currentUser, onLogout }) {
  const [dashboard, setDashboard] = useState({
    onboarding: null,
    transactions: [],
    pendingRequests: [],
    allRequests: [],
    accounts: [],
    auditEntries: [],
    users: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [accountType, setAccountType] = useState('CHECKING')
  const [onboardingMessage, setOnboardingMessage] = useState('')
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false)
  const [transferForm, setTransferForm] = useState({
    sourceAccountNumber: '',
    destinationAccountNumber: '',
    amount: '',
  })
  const [transferKey, setTransferKey] = useState(() => globalThis.crypto.randomUUID())
  const [transferMessage, setTransferMessage] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [moneyForm, setMoneyForm] = useState({ accountNumber: '', amount: '' })
  const [moneyKeys, setMoneyKeys] = useState(() => ({
    DEPOSIT: globalThis.crypto.randomUUID(),
    WITHDRAWAL: globalThis.crypto.randomUUID(),
  }))
  const [moneyMessage, setMoneyMessage] = useState('')
  const [moneyAction, setMoneyAction] = useState('')
  const [requestStatus, setRequestStatus] = useState('ALL')
  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewingRequests, setReviewingRequests] = useState({})
  const [adminMessage, setAdminMessage] = useState('')
  const [depositAmounts, setDepositAmounts] = useState({})
  const [depositKeys, setDepositKeys] = useState({})
  const [depositingAccounts, setDepositingAccounts] = useState({})
  const [ledgerVerification, setLedgerVerification] = useState(null)
  const [isVerifyingLedger, setIsVerifyingLedger] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const data = await fetchDashboardData(currentUser.role === 'ADMIN')
        if (active) {
          setDashboard(data)
          setLoadError('')
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load your dashboard.',
          )
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [currentUser.id, currentUser.role])

  async function refreshDashboard() {
    const data = await fetchDashboardData(currentUser.role === 'ADMIN')
    setDashboard(data)
    setLoadError('')
  }

  async function handleOnboardingSubmit(event) {
    event.preventDefault()
    setIsSubmittingOnboarding(true)
    setOnboardingMessage('')

    try {
      await requestApi('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({ accountType }),
      })
      setOnboardingMessage('Your request has been submitted for review.')
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh your accounts.')
      })
    } catch (error) {
      setOnboardingMessage(
        error instanceof Error ? error.message : 'Unable to submit your request.',
      )
    } finally {
      setIsSubmittingOnboarding(false)
    }
  }

  function updateTransfer(field, value) {
    setTransferForm((current) => ({ ...current, [field]: value }))
    setTransferKey(globalThis.crypto.randomUUID())
    setTransferMessage('')
  }

  async function handleTransferSubmit(event) {
    event.preventDefault()
    if (!isValidAmount(transferForm.amount)) {
      setTransferMessage('Enter a positive amount up to $10,000.')
      return
    }

    setIsTransferring(true)
    setTransferMessage('')

    try {
      await requestApi('/api/transactions/transfers', {
        method: 'POST',
        headers: { 'Idempotency-Key': transferKey },
        body: JSON.stringify(transferForm),
      })
      setTransferMessage('Transfer completed.')
      setTransferForm((current) => ({
        ...current,
        destinationAccountNumber: '',
        amount: '',
      }))
      setTransferKey(globalThis.crypto.randomUUID())
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh your accounts.')
      })
    } catch (error) {
      setTransferMessage(
        error instanceof Error ? error.message : 'Unable to complete the transfer.',
      )
    } finally {
      setIsTransferring(false)
    }
  }

  function updateMoneyForm(field, value) {
    setMoneyForm((current) => ({ ...current, [field]: value }))
    setMoneyKeys({
      DEPOSIT: globalThis.crypto.randomUUID(),
      WITHDRAWAL: globalThis.crypto.randomUUID(),
    })
    setMoneyMessage('')
  }

  async function handleMoneyAction(action) {
    if (!moneyForm.accountNumber || !isValidAmount(moneyForm.amount)) {
      setMoneyMessage('Choose an active account and enter an amount up to $10,000.')
      return
    }

    setMoneyAction(action)
    setMoneyMessage('')

    try {
      await requestApi(`/api/transactions/${action === 'DEPOSIT' ? 'deposits' : 'withdrawals'}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': moneyKeys[action] },
        body: JSON.stringify(moneyForm),
      })
      setMoneyMessage(action === 'DEPOSIT' ? 'Simulated deposit completed.' : 'Withdrawal completed.')
      setMoneyForm((current) => ({ ...current, amount: '' }))
      setMoneyKeys((current) => ({ ...current, [action]: globalThis.crypto.randomUUID() }))
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh your accounts.')
      })
    } catch (error) {
      setMoneyMessage(error instanceof Error ? error.message : 'Unable to complete the transaction.')
    } finally {
      setMoneyAction('')
    }
  }

  async function handleReview(requestId, decision) {
    setAdminMessage('')
    if (decision === 'REJECTED' && !reviewNotes[requestId]?.trim()) {
      setAdminMessage('Enter a review note before rejecting this application.')
      return
    }
    setReviewingRequests((current) => ({ ...current, [requestId]: true }))

    try {
      await requestApi(`/api/admin/onboarding/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewNote: reviewNotes[requestId] || '',
        }),
      })
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh admin data.')
      })
      setAdminMessage(`Application ${decision.toLowerCase()}.`)
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Unable to review this application.')
    } finally {
      setReviewingRequests((current) => ({ ...current, [requestId]: false }))
    }
  }

  function updateDeposit(accountId, amount) {
    setDepositAmounts((current) => ({ ...current, [accountId]: amount }))
    setDepositKeys((current) => ({ ...current, [accountId]: globalThis.crypto.randomUUID() }))
  }

  async function handleDemoDeposit(accountId) {
    setAdminMessage('')
    const amount = depositAmounts[accountId] || ''
    if (!isValidAmount(amount)) {
      setAdminMessage('Enter a positive amount up to $10,000.')
      return
    }

    const idempotencyKey = depositKeys[accountId] || globalThis.crypto.randomUUID()
    setDepositKeys((current) => ({ ...current, [accountId]: idempotencyKey }))
    setDepositingAccounts((current) => ({ ...current, [accountId]: true }))

    try {
      await requestApi(`/api/admin/accounts/${accountId}/deposits`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount }),
      })
      setDepositAmounts((current) => ({ ...current, [accountId]: '' }))
      setDepositKeys((current) => ({ ...current, [accountId]: globalThis.crypto.randomUUID() }))
      setAdminMessage('Simulated demo funding recorded.')
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh admin data.')
      })
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Unable to record demo funding.')
    } finally {
      setDepositingAccounts((current) => ({ ...current, [accountId]: false }))
    }
  }

  async function handleLedgerVerification() {
    setIsVerifyingLedger(true)
    setAdminMessage('')

    try {
      const result = await requestApi('/api/admin/ledger/verification')
      setLedgerVerification(result)
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Unable to verify the ledger.')
      setLedgerVerification(null)
    } finally {
      setIsVerifyingLedger(false)
    }
  }

  const ownAccounts = dashboard.onboarding?.accounts || []
  const activeAccounts = ownAccounts.filter((account) => account.status === 'ACTIVE')
  const application = dashboard.onboarding?.request
  const canApply = !application || application.status !== 'PENDING'
  const visibleRequests = dashboard.allRequests.filter(
    (request) => requestStatus === 'ALL' || request.status === requestStatus,
  )

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">BALANCEVAULT WORKSPACE</p>
          <h2>Welcome, {currentUser.fullName}</h2>
          <p className="form-intro">{currentUser.email}</p>
        </div>
        <button className="text-link inline-link" onClick={onLogout} type="button">
          Sign out
        </button>
      </header>

      {loadError && (
        <p aria-live="polite" className="form-message error-message" role="alert">
          {loadError}
          <button className="text-link inline-link" onClick={refreshDashboard} type="button">
            Retry
          </button>
        </p>
      )}
      {isLoading ? (
        <p aria-live="polite" className="form-message" role="status">Loading your accounts...</p>
      ) : (
        <>
          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SIMULATED MONEY MOVEMENT</p>
                <h3>Deposit or withdraw</h3>
              </div>
            </div>
            {currentUser.role === 'ACCOUNT_HOLDER' && activeAccounts.length ? (
              <div className="signup-form dashboard-form">
                <label className="field">
                  <span>Account</span>
                  <select
                    onChange={(event) => updateMoneyForm('accountNumber', event.target.value)}
                    required
                    value={moneyForm.accountNumber}
                  >
                    <option value="">Select an active account</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.accountNumber}>
                        {account.type} · {account.accountNumber} · {formatCurrency(account.balance, account.currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Amount (maximum $10,000)</span>
                  <input
                    autoComplete="off"
                    inputMode="decimal"
                    maxLength={8}
                    onChange={(event) => updateMoneyForm('amount', event.target.value)}
                    pattern="(?:0|[1-9][0-9]{0,4})(?:\\.[0-9]{1,2})?"
                    placeholder="0.00"
                    required
                    value={moneyForm.amount}
                  />
                </label>
                <div className="admin-actions">
                  <button
                    className="submit-button"
                    disabled={Boolean(moneyAction)}
                    onClick={() => handleMoneyAction('DEPOSIT')}
                    type="button"
                  >
                    {moneyAction === 'DEPOSIT' ? 'Depositing...' : 'Deposit'}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={Boolean(moneyAction)}
                    onClick={() => handleMoneyAction('WITHDRAWAL')}
                    type="button"
                  >
                    {moneyAction === 'WITHDRAWAL' ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                </div>
                {moneyMessage && (
                  <p aria-live="polite" className="form-message" role="status">{moneyMessage}</p>
                )}
              </div>
            ) : currentUser.role === 'ADMIN' ? (
              <p className="empty-state">
                Customer deposits and withdrawals are restricted to account holders. Use admin demo funding below.
              </p>
            ) : (
              <p className="empty-state">
                Deposits and withdrawals are available after an administrator approves your account.
              </p>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR ACCOUNTS</p>
                <h3>Account overview</h3>
              </div>
            </div>
            {ownAccounts.length ? (
              <ul className="dashboard-account-list">
                {ownAccounts.map((account) => (
                  <li key={account.id}>
                    <div>
                      <strong>{account.type === 'CHECKING' ? 'Checking' : 'Savings'}</strong>
                      <span>Account {account.accountNumber}</span>
                    </div>
                    <div className="account-balance">
                      <strong>{formatCurrency(account.balance, account.currency)}</strong>
                      <span className={`status-label status-${account.status.toLowerCase()}`}>
                        {account.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">No accounts yet. Submit an account request to get started.</p>
            )}

            {application && (
              <div className="application-status">
                <h4>Latest application</h4>
                <p>
                  {application.account?.type === 'SAVINGS' ? 'Savings' : 'Checking'} account request:{' '}
                  <strong className={`status-label status-${application.status.toLowerCase()}`}>
                    {application.status === 'PENDING' ? 'Pending review' : application.status}
                  </strong>
                </p>
                {application.reviewedAt && (
                  <p>Reviewed {new Date(application.reviewedAt).toLocaleString()}</p>
                )}
                {application.reviewNote && <p>Review note: {application.reviewNote}</p>}
              </div>
            )}

            {canApply && (
              <form className="signup-form onboarding-form" onSubmit={handleOnboardingSubmit}>
                <label className="field" htmlFor="account-type">
                  <span>{application ? 'Request another account' : 'Account type'}</span>
                  <select
                    id="account-type"
                    onChange={(event) => setAccountType(event.target.value)}
                    value={accountType}
                  >
                    <option value="CHECKING">Checking</option>
                    <option value="SAVINGS">Savings</option>
                  </select>
                </label>
                <button className="submit-button" disabled={isSubmittingOnboarding} type="submit">
                  {isSubmittingOnboarding ? 'Submitting...' : 'Request account'}
                </button>
                {onboardingMessage && (
                  <p aria-live="polite" className="form-message" role="status">
                    {onboardingMessage}
                  </p>
                )}
              </form>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MOVE MONEY</p>
                <h3>Internal transfer</h3>
              </div>
            </div>
            {currentUser.role === 'ACCOUNT_HOLDER' && activeAccounts.length ? (
              <form className="signup-form dashboard-form" onSubmit={handleTransferSubmit}>
                <label className="field" htmlFor="transfer-source">
                  <span>From account</span>
                  <select
                    id="transfer-source"
                    onChange={(event) => updateTransfer('sourceAccountNumber', event.target.value)}
                    required
                    value={transferForm.sourceAccountNumber}
                  >
                    <option value="">Select an active account</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.accountNumber}>
                        {account.type} · {account.accountNumber} · {formatCurrency(account.balance, account.currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>To account number</span>
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={16}
                    onChange={(event) => updateTransfer('destinationAccountNumber', event.target.value)}
                    pattern="[0-9]{16}"
                    placeholder="16-digit account number"
                    required
                    value={transferForm.destinationAccountNumber}
                  />
                </label>
                <label className="field">
                  <span>Amount (USD, maximum $10,000)</span>
                  <input
                    autoComplete="off"
                    inputMode="decimal"
                    maxLength={8}
                    onChange={(event) => updateTransfer('amount', event.target.value)}
                    pattern="(?:0|[1-9][0-9]{0,4})(?:\\.[0-9]{1,2})?"
                    placeholder="0.00"
                    required
                    value={transferForm.amount}
                  />
                </label>
                <button className="submit-button" disabled={isTransferring} type="submit">
                  {isTransferring ? 'Sending...' : 'Send transfer'}
                </button>
                {transferMessage && (
                  <p aria-live="polite" className="form-message" role="status">
                    {transferMessage}
                  </p>
                )}
              </form>
            ) : currentUser.role === 'ADMIN' ? (
              <p className="empty-state">Internal transfers are restricted to account holders.</p>
            ) : (
              <p className="empty-state">
                Transfers are available after an administrator approves an account with funds.
              </p>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ACCOUNT ACTIVITY</p>
                <h3>Recent transactions</h3>
              </div>
            </div>
            {dashboard.transactions.length ? (
              <>
                <p className="empty-state">{dashboard.transactions.length} recent transaction(s).</p>
                <ul className="transaction-list">
                {dashboard.transactions.map((transaction) => {
                  const outgoing = ownAccounts.some(
                    (account) => account.accountNumber === transaction.sourceAccount?.accountNumber,
                  )
                  const formattedAmount = formatCurrency(
                    transaction.amount,
                    transaction.currency,
                  )
                  const signedAmount =
                    transaction.type === 'WITHDRAWAL' ||
                    (transaction.type === 'TRANSFER' && outgoing)
                      ? `-${formattedAmount}`
                      : transaction.type === 'TRANSFER' || transaction.type === 'DEPOSIT'
                        ? `+${formattedAmount}`
                        : formattedAmount

                  return (
                    <li key={transaction.id}>
                      <div>
                        <strong>{transaction.type.replace('_', ' ')}</strong>
                        <span>{new Date(transaction.createdAt).toLocaleString()}</span>
                        <small>
                          {transaction.status} · Ref {transaction.id}
                          {transaction.description && ` · ${transaction.description}`}
                        </small>
                        {(transaction.sourceAccount || transaction.destinationAccount) && (
                          <small>
                            {transaction.sourceAccount && `From ···${transaction.sourceAccount.accountNumber.slice(-4)}`}
                            {transaction.sourceAccount && transaction.destinationAccount && ' → '}
                            {transaction.destinationAccount && `To ···${transaction.destinationAccount.accountNumber.slice(-4)}`}
                          </small>
                        )}
                      </div>
                      <strong>{signedAmount}</strong>
                    </li>
                  )
                })}
                </ul>
              </>
            ) : (
              <p className="empty-state">No transactions yet.</p>
            )}
          </section>

          {currentUser.role === 'ADMIN' && (
            <section className="dashboard-section admin-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ADMINISTRATION</p>
                  <h3>Account applications</h3>
                </div>
              </div>
              {adminMessage && (
                <p aria-live="polite" className="form-message" role="status">{adminMessage}</p>
              )}
              <label className="field">
                <span>Filter applications</span>
                <select
                  onChange={(event) => setRequestStatus(event.target.value)}
                  value={requestStatus}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              {visibleRequests.length ? (
                <ul className="admin-request-list">
                    {visibleRequests.map((request) => (
                      <li key={request.id}>
                        <div className="admin-request-heading">
                          <div>
                            <strong>{request.applicant.fullName}</strong>
                            <span>{request.applicant.email}</span>
                          </div>
                          <span>
                            {request.account?.type} · {request.account?.accountNumber} ·{' '}
                            <strong className={`status-label status-${request.status.toLowerCase()}`}>
                              {request.status}
                            </strong>
                          </span>
                        </div>
                        <small>
                          Submitted {new Date(request.submittedAt).toLocaleString()}
                          {request.reviewedAt && ` · Reviewed ${new Date(request.reviewedAt).toLocaleString()}`}
                        </small>
                        {request.status === 'PENDING' && (
                          <>
                            <label className="field">
                              <span>Review note (required to reject)</span>
                              <input
                                maxLength={500}
                                onChange={(event) =>
                                  setReviewNotes((current) => ({
                                    ...current,
                                    [request.id]: event.target.value,
                                  }))
                                }
                                value={reviewNotes[request.id] || ''}
                              />
                            </label>
                            <div className="admin-actions">
                              <button
                                className="submit-button"
                                disabled={Boolean(reviewingRequests[request.id])}
                                onClick={() => handleReview(request.id, 'APPROVED')}
                                type="button"
                              >
                                {reviewingRequests[request.id] ? 'Reviewing...' : 'Approve'}
                              </button>
                              <button
                                className="secondary-button"
                                disabled={Boolean(reviewingRequests[request.id])}
                                onClick={() => handleReview(request.id, 'REJECTED')}
                                type="button"
                              >
                                {reviewingRequests[request.id] ? 'Reviewing...' : 'Reject'}
                              </button>
                            </div>
                          </>
                        )}
                        {request.reviewNote && <small>Review note: {request.reviewNote}</small>}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="empty-state">
                  {requestStatus === 'ALL'
                    ? 'No account applications have been submitted.'
                    : `No ${requestStatus.toLowerCase()} applications.`}
                </p>
              )}

              <h4>Registered users</h4>
              {dashboard.users.length ? (
                <ul className="admin-account-list">
                  {dashboard.users.map((user) => (
                    <li key={user.id}>
                      <div>
                        <strong>{user.fullName}</strong>
                        <span>{user.email} · {user.role}</span>
                        <span>
                          {user.accounts.length
                            ? user.accounts.map((account) =>
                                `${account.type} ···${account.accountNumber.slice(-4)} · ${account.status} · ${formatCurrency(account.balance, account.currency)}`,
                              ).join(' | ')
                            : 'No accounts'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No registered users found.</p>
              )}

              <h4>Accounts and simulated demo funding</h4>
              <ul className="admin-account-list">
                {dashboard.accounts.map((account) => (
                  <li key={account.id}>
                    <div>
                      <strong>{account.owner?.fullName || 'Unassigned system account'}</strong>
                      <span>
                        {account.type === 'SYSTEM' ? 'System clearing' : account.type} · {account.accountNumber} ·{' '}
                        {formatCurrency(account.balance, account.currency)} · {account.status}
                      </span>
                    </div>
                    {account.status === 'ACTIVE' && account.type !== 'SYSTEM' && (
                      <div className="admin-deposit">
                        <input
                          aria-label={`Simulated amount for ${account.accountNumber}`}
                          inputMode="decimal"
                          maxLength={8}
                          onChange={(event) => updateDeposit(account.id, event.target.value)}
                          placeholder="USD amount"
                          type="text"
                          value={depositAmounts[account.id] || ''}
                        />
                        <button
                          className="secondary-button"
                          disabled={Boolean(depositingAccounts[account.id])}
                          onClick={() => handleDemoDeposit(account.id)}
                          type="button"
                        >
                          {depositingAccounts[account.id] ? 'Adding funds...' : 'Add demo funds'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <h4>Recent audit events</h4>
              {dashboard.auditEntries.length ? (
                <ul className="audit-list">
                  {dashboard.auditEntries.slice(0, 10).map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.action.replaceAll('_', ' ')}</span>
                      <small>
                        {entry.actor?.email || 'System'} · {new Date(entry.createdAt).toLocaleString()}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No audit events recorded.</p>
              )}

              <h4>Ledger verification</h4>
              <button
                className="secondary-button"
                disabled={isVerifyingLedger}
                onClick={handleLedgerVerification}
                type="button"
              >
                {isVerifyingLedger ? 'Verifying...' : 'Verify completed transactions'}
              </button>
              {ledgerVerification && (
                <div aria-live="polite" className="application-status" role="status">
                  <p>
                    Checked {ledgerVerification.checkedTransactions} transactions: {' '}
                    {ledgerVerification.validTransactions} valid, {ledgerVerification.issueCount} issue(s).
                  </p>
                  {ledgerVerification.issues.length > 0 && (
                    <ul>
                      {ledgerVerification.issues.slice(0, 20).map((issue) => (
                        <li key={issue.transactionId}>
                          {issue.transactionId}: {issue.reasons.join(' ')}
                        </li>
                      ))}
                    </ul>
                  )}
                  <small>Verified {new Date(ledgerVerification.verifiedAt).toLocaleString()}</small>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default Dashboard
