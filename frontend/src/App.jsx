import { useRef, useState } from 'react'
import './App.css'

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function EyeIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {visible ? (
        <>
          <path d="M3 3 21 21" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15.7 15.7 0 0 1-3.1 3.8M6.2 6.2C4.1 7.6 3 10 3 12c0 0 3.5 7 9 7 1.4 0 2.7-.5 3.8-1.2" />
        </>
      ) : (
        <>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

function App() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState('')
  const confirmPasswordInput = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()
    setSubmissionMessage(
      'Registration is not connected to a backend yet. Your information has not been sent or saved.',
    )
  }

  function handlePasswordChange(event) {
    const value = event.target.value
    setPassword(value)
    confirmPasswordInput.current?.setCustomValidity(
      confirmPassword && confirmPassword !== value
        ? 'Passwords do not match.'
        : '',
    )
    setSubmissionMessage('')
  }

  function handleConfirmPasswordChange(event) {
    const value = event.target.value
    setConfirmPassword(value)
    event.target.setCustomValidity(
      value && value !== password ? 'Passwords do not match.' : '',
    )
    setSubmissionMessage('')
  }

  return (
    <main className="signup-page">
      <aside className="brand-panel" aria-label="About BalanceVault">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>BalanceVault</span>
        </div>

        <div className="brand-message">
          <p className="eyebrow">MONEY MOVEMENT, MADE CLEAR</p>
          <h1>
            Every move
            <br />
            has a <span>record.</span>
          </h1>
          <p className="brand-description">
            A clearer way to manage your money, built around a ledger you can
            prove.
          </p>
        </div>

        <div className="ledger-card" aria-label="Example account activity">
          <div className="ledger-card-heading">
            <span>LEDGER SNAPSHOT</span>
            <span className="live-indicator">
              <i /> SAMPLE DATA
            </span>
          </div>
          <div className="ledger-balance-label">Available balance</div>
          <div className="ledger-balance">$12,840.50</div>
          <div className="ledger-rule" />
          <div className="ledger-entry">
            <span className="entry-icon entry-in">↙</span>
            <span className="entry-description">
              <strong>Monthly deposit</strong>
              <small>Today, 9:41 AM</small>
            </span>
            <strong className="entry-amount">+$2,400.00</strong>
          </div>
          <div className="ledger-entry">
            <span className="entry-icon entry-out">↗</span>
            <span className="entry-description">
              <strong>Rent payment</strong>
              <small>Yesterday, 2:16 PM</small>
            </span>
            <strong className="entry-amount">−$1,850.00</strong>
          </div>
          <div className="ledger-proof">
            <ShieldIcon />
            <span>Illustrative activity preview</span>
          </div>
        </div>

        <div className="brand-footer">
          <span>BUILT ON TRUST. BACKED BY A LEDGER.</span>
          <span>01 / 03</span>
        </div>
      </aside>

      <section className="form-panel">
        <div className="mobile-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>BalanceVault</span>
        </div>

        <div className="form-wrap">
          <div className="form-heading">
            <p className="eyebrow">YOUR FINANCIAL HOME</p>
            <h2>Create your account</h2>
            <p className="form-intro">
              Start with the essentials. You can finish setting up your account
              later.
            </p>
          </div>

          <form className="signup-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Full name</span>
              <input
                autoComplete="name"
                name="name"
                placeholder="e.g. Alex Morgan"
                required
                type="text"
              />
            </label>

            <label className="field">
              <span>Email address</span>
              <input
                autoComplete="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </label>

            <div className="field">
              <label htmlFor="password">Password</label>
              <span className="password-input">
                <input
                  autoComplete="new-password"
                  id="password"
                  minLength={12}
                  name="password"
                  onChange={handlePasswordChange}
                  placeholder="At least 12 characters"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="visibility-button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </span>
              <small className="field-hint">
                Use at least 12 characters for a stronger password.
              </small>
            </div>

            <div className="field">
              <label htmlFor="confirm-password">Confirm password</label>
              <span className="password-input">
                <input
                  autoComplete="new-password"
                  id="confirm-password"
                  name="confirmPassword"
                  onChange={handleConfirmPasswordChange}
                  placeholder="Enter your password again"
                  required
                  ref={confirmPasswordInput}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                />
                <button
                  aria-label={
                    showConfirmPassword
                      ? 'Hide confirmation password'
                      : 'Show confirmation password'
                  }
                  className="visibility-button"
                  onClick={() =>
                    setShowConfirmPassword((visible) => !visible)
                  }
                  type="button"
                >
                  <EyeIcon visible={showConfirmPassword} />
                </button>
              </span>
            </div>

            <label className="terms-field">
              <input name="terms" required type="checkbox" />
              <span>
                I understand this prototype does not create an account or store
                my information.
              </span>
            </label>

            <button className="submit-button" type="submit">
              Create account
              <ArrowIcon />
            </button>

            {submissionMessage && (
              <p aria-live="polite" className="form-message" role="status">
                {submissionMessage}
              </p>
            )}
          </form>

          <div className="security-note">
            <ShieldIcon />
            <p>
              <strong>Your information stays yours.</strong>
              <span>
                This frontend prototype does not send or store form details.
              </span>
            </p>
          </div>

          <p className="sign-in-prompt">
            This is the first step in building BalanceVault.
          </p>
        </div>

        <footer className="form-footer">
          <span>© 2026 BalanceVault</span>
          <span>Secure by design</span>
        </footer>
      </section>
    </main>
  )
}

export default App
