import { describe, expect, it } from 'vitest'
import { hashPassword, passwordProblem, verifyPassword } from './password'
import { hashToken, newToken } from './tokens'

describe('passwords', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery')
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(h, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(h, 'correct horse batterY')).toBe(false)
  })

  it('never stores the password itself', async () => {
    const h = await hashPassword('correct horse battery')
    expect(h).not.toContain('correct horse battery')
  })

  it('returns false rather than throwing for a missing or corrupt hash', async () => {
    expect(await verifyPassword(null, 'anything at all')).toBe(false)
    expect(await verifyPassword('not-a-hash', 'anything at all')).toBe(false)
  })

  it('enforces length limits', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/)
    expect(passwordProblem('x'.repeat(129))).toMatch(/at most 128/)
    expect(passwordProblem('long enough passphrase')).toBeNull()
  })
})

describe('tokens', () => {
  it('are unique, URL-safe and hashed deterministically', () => {
    const a = newToken()
    const b = newToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashToken(a)).toBe(hashToken(a))
    expect(hashToken(a)).not.toBe(a)
  })
})

describe('unknown-email timing', () => {
  it('spends real hashing time when no stored hash exists', async () => {
    const real = await hashPassword('some other password')
    await verifyPassword(null, 'warm up the dummy hash')
    const t0 = performance.now()
    await verifyPassword(real, 'wrong password here')
    const knownMs = performance.now() - t0
    const t1 = performance.now()
    await verifyPassword(null, 'wrong password here')
    const unknownMs = performance.now() - t1
    // Same order of magnitude, not a fast-fail.
    expect(unknownMs).toBeGreaterThan(knownMs / 4)
  })
})
