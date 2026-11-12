import test from 'node:test'
import assert from 'node:assert/strict'
import { decimalToUnits, parseMoney, unitsToDecimal } from '../money.js'

test('money parsing preserves exact decimal values and enforces the limit', () => {
  assert.equal(parseMoney('0.01'), 100n)
  assert.equal(parseMoney('125.5'), 1_255_000n)
  assert.equal(parseMoney('10000.00'), 100_000_000n)
  assert.equal(parseMoney('10000.01'), null)
  assert.equal(parseMoney('0'), null)
  assert.equal(parseMoney('01.00'), null)
  assert.equal(parseMoney('1.001'), null)
})

test('decimal balances convert without floating-point rounding', () => {
  assert.equal(decimalToUnits('12.3456'), 123_456n)
  assert.equal(unitsToDecimal(123_456n), '12.3456')
  assert.throws(() => unitsToDecimal(0n))
})
