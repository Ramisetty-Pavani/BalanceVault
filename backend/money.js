const MONEY_PATTERN = /^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/
const MONEY_SCALE = 10_000n
const MAX_AMOUNT = 10_000n * MONEY_SCALE

function parseMoney(value) {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) {
    return null
  }

  const [whole, fraction = ''] = value.split('.')
  const units = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(4, '0'))

  return units > 0n && units <= MAX_AMOUNT ? units : null
}

function decimalToUnits(value) {
  const decimal = value.toString()
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,4}))?$/.exec(decimal)

  if (!match) {
    throw new Error('Stored account balance has an invalid decimal value.')
  }

  return BigInt(match[1]) * MONEY_SCALE + BigInt((match[2] || '').padEnd(4, '0'))
}

function unitsToDecimal(units) {
  if (typeof units !== 'bigint' || units <= 0n) {
    throw new Error('Money amount must be a positive integer in 1/10000 units.')
  }

  const whole = units / MONEY_SCALE
  const fraction = String(units % MONEY_SCALE).padStart(4, '0')
  return `${whole}.${fraction}`
}

export { decimalToUnits, parseMoney, unitsToDecimal }
