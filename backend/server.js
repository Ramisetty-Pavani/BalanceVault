const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 4000
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

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
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'BalanceVault API',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/ready', (_req, res) => {
  res.json({
    status: 'ready',
    database: 'MySQL connection pending configuration',
  })
})

app.get('/api/auth/me', (_req, res) => {
  res.status(401).json({
    message: 'Authentication is not configured yet. This endpoint will return the current user after login is implemented.',
  })
})

app.post('/api/auth/register', (_req, res) => {
  res.status(501).json({
    message: 'Registration endpoint is planned for the next module. Backend persistence is not active yet.',
  })
})

app.use((error, _req, res, _next) => {
  if (error && error.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed by CORS' })
  }

  return res.status(500).json({ message: 'Unexpected server error' })
})

app.listen(port, () => {
  console.log(`BalanceVault backend listening on http://localhost:${port}`)
})
