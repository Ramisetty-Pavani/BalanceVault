import { useEffect, useState } from 'react'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

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
    accounts: [],
    auditEntries: [],
  }

  if (isAdmin) {
    const [requestData, accountData, auditData] = await Promise.all([
      requestApi('/api/admin/onboarding'),
      requestApi('/api/admin/accounts'),
      requestApi('/api/admin/audit-logs'),
    ])
    data.pendingRequests = requestData.requests
    data.accounts = accountData.accounts
    data.auditEntries = auditData.entries
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

function Dashboard({ currentUser, onLogout }) {
  const [dashboard, setDashboard] = useState({
    onboarding: null,
    transactions: [],
    pendingRequests: [],
    accounts: [],
    auditEntries: [],
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
  const [reviewNotes, setReviewNotes] = useState({})
  const [adminMessage, setAdminMessage] = useState('')
  const [depositAmounts, setDepositAmounts] = useState({})
  const [depositKeys, setDepositKeys] = useState({})

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

  async function handleReview(requestId, decision) {
    setAdminMessage('')

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
    }
  }

  function updateDeposit(accountId, amount) {
    setDepositAmounts((current) => ({ ...current, [accountId]: amount }))
    setDepositKeys((current) => ({ ...current, [accountId]: globalThis.crypto.randomUUID() }))
  }

  async function handleDemoDeposit(accountId) {
    setAdminMessage('')
    const idempotencyKey = depositKeys[accountId] || globalThis.crypto.randomUUID()
    setDepositKeys((current) => ({ ...current, [accountId]: idempotencyKey }))

    try {
      await requestApi(`/api/admin/accounts/${accountId}/deposits`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount: depositAmounts[accountId] || '' }),
      })
      setDepositAmounts((current) => ({ ...current, [accountId]: '' }))
      setDepositKeys((current) => ({ ...current, [accountId]: globalThis.crypto.randomUUID() }))
      setAdminMessage('Simulated demo funding recorded.')
      await refreshDashboard().catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to refresh admin data.')
      })
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Unable to record demo funding.')
    }
  }

  const ownAccounts = dashboard.onboarding?.accounts || []
  const activeAccounts = ownAccounts.filter((account) => account.status === 'ACTIVE')
  const application = dashboard.onboarding?.request
  const canApply = !application || application.status !== 'PENDING'

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
            {activeAccounts.length ? (
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
                    inputMode="decimal"
                    max="10000"
                    min="0.01"
                    onChange={(event) => updateTransfer('amount', event.target.value)}
                    required
                    step="0.01"
                    type="number"
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
                        <small>{transaction.description || transaction.status}</small>
                      </div>
                      <strong>{signedAmount}</strong>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="empty-state">No transactions yet.</p>
            )}
          </section>

          {currentUser.role === 'ADMIN' && (
            <section className="dashboard-section admin-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ADMINISTRATION</p>
                  <h3>Pending account reviews</h3>
                </div>
              </div>
              {adminMessage && (
                <p aria-live="polite" className="form-message" role="status">{adminMessage}</p>
              )}
              {dashboard.pendingRequests.length ? (
                <ul className="admin-request-list">
                  {dashboard.pendingRequests.map((request) => (
                    <li key={request.id}>
                      <div className="admin-request-heading">
                        <div>
                          <strong>{request.applicant.fullName}</strong>
                          <span>{request.applicant.email}</span>
                        </div>
                        <span>{request.account?.type} · {request.account?.accountNumber}</span>
                      </div>
                      <small>Submitted {new Date(request.submittedAt).toLocaleString()}</small>
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
                          onClick={() => handleReview(request.id, 'APPROVED')}
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => handleReview(request.id, 'REJECTED')}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No applications are waiting for review.</p>
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
                          max="10000"
                          min="0.01"
                          onChange={(event) => updateDeposit(account.id, event.target.value)}
                          placeholder="USD amount"
                          step="0.01"
                          type="number"
                          value={depositAmounts[account.id] || ''}
                        />
                        <button
                          className="secondary-button"
                          onClick={() => handleDemoDeposit(account.id)}
                          type="button"
                        >
                          Add demo funds
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
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default Dashboard
