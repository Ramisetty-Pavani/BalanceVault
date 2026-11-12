import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from '../auth-security.js'

test('password hashes are salted and verify only the original password', async () => {
  const firstHash = await hashPassword('Correct Horse Battery 42!')
  const secondHash = await hashPassword('Correct Horse Battery 42!')

  assert.notEqual(firstHash, secondHash)
  assert.equal(await verifyPassword('Correct Horse Battery 42!', firstHash), true)
  assert.equal(await verifyPassword('Incorrect Password 42!', firstHash), false)
})

test('session tokens reject tampering and expiration', () => {
  const now = 1_800_000_000_000
  const token = createSessionToken('user-id', 'a'.repeat(32), 3600, now)

  assert.deepEqual(verifySessionToken(token, 'a'.repeat(32), now), {
    userId: 'user-id',
    expiresAt: Math.floor(now / 1000) + 3600,
  })
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, 'a'.repeat(32), now), null)
  assert.equal(verifySessionToken(token, 'b'.repeat(32), now), null)
  assert.equal(verifySessionToken(token, 'a'.repeat(32), now + 3600 * 1000), null)
})
