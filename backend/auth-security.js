import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const PASSWORD_HASH_BYTES = 64
const SESSION_ISSUER = 'balancevault-api'

async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, PASSWORD_HASH_BYTES, SCRYPT_OPTIONS)

  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$')
}

async function verifyPassword(password, encodedHash) {
  const [algorithm, n, r, p, saltValue, hashValue, extra] = encodedHash.split('$')

  if (
    algorithm !== 'scrypt' ||
    Number(n) !== SCRYPT_OPTIONS.N ||
    Number(r) !== SCRYPT_OPTIONS.r ||
    Number(p) !== SCRYPT_OPTIONS.p ||
    !saltValue ||
    !hashValue ||
    extra !== undefined
  ) {
    return false
  }

  const salt = Buffer.from(saltValue, 'base64url')
  const expectedHash = Buffer.from(hashValue, 'base64url')

  if (salt.length !== 16 || expectedHash.length !== PASSWORD_HASH_BYTES) {
    return false
  }

  const actualHash = await scrypt(password, salt, PASSWORD_HASH_BYTES, SCRYPT_OPTIONS)
  return timingSafeEqual(actualHash, expectedHash)
}

function createSessionToken(userId, secret, expiresInSeconds, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000)
  const payload = {
    sub: userId,
    iss: SESSION_ISSUER,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  }
  const content = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  const signature = createHmac('sha256', secret).update(content).digest('base64url')

  return `${content}.${signature}`
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') {
    return null
  }

  const parts = token.split('.')

  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null
  }

  const content = `${parts[0]}.${parts[1]}`
  const expectedSignature = createHmac('sha256', secret).update(content).digest()
  const actualSignature = Buffer.from(parts[2], 'base64url')

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null
  }

  let header
  let payload

  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (
    header.alg !== 'HS256' ||
    header.typ !== 'JWT' ||
    typeof payload.sub !== 'string' ||
    payload.iss !== SESSION_ISSUER ||
    !Number.isInteger(payload.exp) ||
    !Number.isInteger(payload.iat) ||
    payload.exp <= Math.floor(now / 1000) ||
    payload.iat > Math.floor(now / 1000)
  ) {
    return null
  }

  return { userId: payload.sub, expiresAt: payload.exp }
}

export {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
}
