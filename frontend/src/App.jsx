import { useEffect, useMemo, useState } from 'react'
import Dashboard from './Dashboard'
import './App.css'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

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

function getPasswordStrength(password) {
  if (!password) {
    return { label: '', score: 0, className: 'strength-none' }
  }

  let score = 0

  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 1) {
    return { label: 'Weak', score, className: 'strength-weak' }
  }

  if (score === 2 || score === 3) {
    return { label: 'Good', score, className: 'strength-good' }
  }

  return { label: 'Strong', score, className: 'strength-strong' }
}

function App() {
  const [mode, setMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  })
  const [submissionMessage, setSubmissionMessage] = useState('')

  const passwordStrength = useMemo(
    () => getPasswordStrength(registerForm.password),
    [registerForm.password],
  )

  useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          credentials: 'include',
        })

        if (response.status === 401) {
          return
        }

        const result = await response.json()
        if (!response.ok) {
          throw new Error(result.message || 'Unable to check your sign-in status.')
        }

        if (active) {
          setCurrentUser(result.user)
        }
      } catch {
        if (active) {
          setSubmissionMessage('Unable to connect to BalanceVault. Please try again.')
        }
      } finally {
        if (active) {
          setIsCheckingSession(false)
        }
      }
    }

    loadSession()
    return () => {
      active = false
    }
  }, [])

  async function submitAuthRequest(path, payload, successMessage) {
    setIsSubmitting(true)
    setSubmissionMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Unable to complete your request.')
      }

      setCurrentUser(result.user)
      setSubmissionMessage(successMessage)
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect to BalanceVault. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault()

    if (!loginForm.email || !loginForm.password) {
      setSubmissionMessage('Please enter both your email address and password.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.email)) {
      setSubmissionMessage('Enter a valid email address before continuing.')
      return
    }

    await submitAuthRequest(
      '/api/auth/login',
      {
        email: loginForm.email,
        password: loginForm.password,
        rememberMe: loginForm.rememberMe,
      },
      'You are signed in.',
    )
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault()

    if (!registerForm.fullName.trim()) {
      setSubmissionMessage('Please enter your full name.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) {
      setSubmissionMessage('Please use a valid email address.')
      return
    }

    if (registerForm.password.length < 12) {
      setSubmissionMessage('Password must be at least 12 characters long.')
      return
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setSubmissionMessage('Your passwords do not match. Please try again.')
      return
    }

    if (passwordStrength.score < 3) {
      setSubmissionMessage(
        'Choose a stronger password with a mix of letters, numbers, and symbols.',
      )
      return
    }

    if (!registerForm.agreeTerms) {
      setSubmissionMessage('Please accept the prototype notice before creating your account.')
      return
    }

    await submitAuthRequest(
      '/api/auth/register',
      {
        fullName: registerForm.fullName,
        email: registerForm.email,
        password: registerForm.password,
      },
      'Your account has been created and you are signed in.',
    )
  }

  async function handleLogout() {
    setSubmissionMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Unable to sign out. Please try again.')
      }

      setCurrentUser(null)
      setMode('login')
      setSubmissionMessage('You are signed out.')
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect to BalanceVault. Please try again.',
      )
    }
  }

  function handleModeChange(nextMode) {
    setMode(nextMode)
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

        <div className={`form-wrap${currentUser ? ' dashboard-wrap' : ''}`}>
          {!currentUser && (
            <div className="form-heading">
              <p className="eyebrow">YOUR FINANCIAL HOME</p>
              <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
              <p className="form-intro">
                {mode === 'login'
                  ? 'Sign in to continue to your secure finance workspace.'
                  : 'Start with the essentials. You can finish setting up your account later.'}
              </p>
            </div>
          )}

          {currentUser ? (
            <Dashboard currentUser={currentUser} onLogout={handleLogout} />
          ) : isCheckingSession ? (
            <p aria-live="polite" className="form-message" role="status">
              Checking your sign-in status...
            </p>
          ) : (
          <>
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => handleModeChange('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => handleModeChange('register')}
            >
              Register
            </button>
          </div>

          {mode === 'login' ? (
            <form className="signup-form" onSubmit={handleLoginSubmit}>
              <label className="field">
                <span>Email address</span>
                <input
                  autoComplete="email"
                  name="email"
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={loginForm.email}
                />
              </label>

              <div className="field">
                <label htmlFor="login-password">Password</label>
                <span className="password-input">
                  <input
                    autoComplete="current-password"
                    id="login-password"
                    name="password"
                    onChange={(event) =>
                      setLoginForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Enter your password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
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
              </div>

              <div className="login-row">
                <label className="remember-me">
                  <input
                    checked={loginForm.rememberMe}
                    onChange={(event) =>
                      setLoginForm((current) => ({
                        ...current,
                        rememberMe: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Remember me</span>
                </label>
                <button className="text-link" type="button">
                  Forgot password?
                </button>
              </div>

              <button className="submit-button" disabled={isSubmitting} type="submit">
                Sign in
                <ArrowIcon />
              </button>

              {submissionMessage && (
                <p aria-live="polite" className="form-message" role="status">
                  {submissionMessage}
                </p>
              )}

              <p className="sign-in-prompt">
                Need an account?{' '}
                <button className="text-link inline-link" onClick={() => handleModeChange('register')} type="button">
                  Create one
                </button>
              </p>
            </form>
          ) : (
            <form className="signup-form" onSubmit={handleRegisterSubmit}>
              <label className="field">
                <span>Full name</span>
                <input
                  autoComplete="name"
                  name="fullName"
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  placeholder="e.g. Alex Morgan"
                  required
                  type="text"
                  value={registerForm.fullName}
                />
              </label>

              <label className="field">
                <span>Email address</span>
                <input
                  autoComplete="email"
                  name="email"
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={registerForm.email}
                />
              </label>

              <div className="field">
                <label htmlFor="register-password">Password</label>
                <span className="password-input">
                  <input
                    autoComplete="new-password"
                    id="register-password"
                    minLength={12}
                    name="password"
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="At least 12 characters"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={registerForm.password}
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
                {registerForm.password && (
                  <div className="password-strength" aria-live="polite">
                    <span className={`strength-bar ${passwordStrength.className}`} />
                    <small>
                      Password strength: {passwordStrength.label || '—'}
                    </small>
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="register-confirm-password">Confirm password</label>
                <span className="password-input">
                  <input
                    autoComplete="new-password"
                    id="register-confirm-password"
                    name="confirmPassword"
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    placeholder="Enter your password again"
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={registerForm.confirmPassword}
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
                {registerForm.confirmPassword && (
                  <small
                    className={
                      registerForm.password === registerForm.confirmPassword
                        ? 'field-hint success-hint'
                        : 'field-hint error-hint'
                    }
                  >
                    {registerForm.password === registerForm.confirmPassword
                      ? 'Passwords match.'
                      : 'Passwords do not match.'}
                  </small>
                )}
              </div>

              <label className="terms-field">
                <input
                  checked={registerForm.agreeTerms}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      agreeTerms: event.target.checked,
                    }))
                  }
                  name="terms"
                  required
                  type="checkbox"
                />
                <span>
                  I understand this prototype stores my account information for sign-in.
                </span>
              </label>

              <button className="submit-button" disabled={isSubmitting} type="submit">
                Create account
                <ArrowIcon />
              </button>

              {submissionMessage && (
                <p aria-live="polite" className="form-message" role="status">
                  {submissionMessage}
                </p>
              )}

              <p className="sign-in-prompt">
                Already registered?{' '}
                <button className="text-link inline-link" onClick={() => handleModeChange('login')} type="button">
                  Sign in
                </button>
              </p>
            </form>
          )}
          </>
          )}

          <div className="security-note">
            <ShieldIcon />
            <p>
              <strong>Your information stays yours.</strong>
              <span>
                Passwords are hashed, and sessions use HttpOnly cookies.
              </span>
            </p>
          </div>
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
