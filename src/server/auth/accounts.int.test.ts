// Integration tests for accounts, sessions and rate limits against a real
// PostgreSQL database.
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { consumeRateLimit, resetRateLimit } from '../rate-limit'
import {
  authenticate,
  consumeToken,
  issueToken,
  registerUser,
  resetPasswordWithToken,
  safeReturnPath,
  verifyEmailToken,
} from './accounts'
import { createSessionRecord, deleteSessionRecord, findSessionUser, isStaff } from './session-store'

const tag = `it-auth-${Date.now()}`
const email = (s: string) => `${tag}-${s}@example.test`
const PASSWORD = 'correct horse battery'

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.rateLimit.deleteMany({ where: { key: { startsWith: tag } } })
  await db.$disconnect()
})

describe('registration and login', () => {
  it('registers once per email, case-insensitively', async () => {
    const first = await registerUser({ email: email('reg'), password: PASSWORD, name: 'Test' })
    expect(first.ok).toBe(true)
    const again = await registerUser({ email: email('reg').toUpperCase(), password: PASSWORD, name: 'Test' })
    expect(again).toEqual({ ok: false, reason: 'EMAIL_TAKEN' })
  })

  it('stores an Argon2id hash, never the password', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain(PASSWORD)
    expect(user.role).toBe('CUSTOMER')
  })

  it('accepts the right password and rejects wrong, unknown and disabled accounts', async () => {
    expect(await authenticate(email('reg'), PASSWORD)).toEqual(expect.any(String))
    expect(await authenticate(email('reg'), 'wrong password!!')).toBeNull()
    expect(await authenticate(email('nobody'), PASSWORD)).toBeNull()

    const r = await registerUser({ email: email('disabled'), password: PASSWORD, name: '' })
    if (!r.ok) throw new Error('setup failed')
    await db.user.update({ where: { id: r.userId }, data: { isActive: false } })
    expect(await authenticate(email('disabled'), PASSWORD)).toBeNull()
  })
})

describe('sessions', () => {
  it('finds the user by token, stores only a hash, and forgets it on sign-out', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const { token } = await createSessionRecord(user.id)
    expect(await db.session.count({ where: { sessionToken: token } })).toBe(0)

    const found = await findSessionUser(token)
    expect(found?.id).toBe(user.id)
    expect(isStaff(found)).toBe(false)

    await deleteSessionRecord(token)
    expect(await findSessionUser(token)).toBeNull()
  })

  it('ignores expired sessions and made-up tokens', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const { token } = await createSessionRecord(user.id)
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await findSessionUser(token)).toBeNull()
    expect(await findSessionUser('not-a-real-token')).toBeNull()
  })

  it('treats only staff roles as staff', () => {
    expect(isStaff(null)).toBe(false)
    expect(isStaff({ role: 'CUSTOMER' })).toBe(false)
    expect(isStaff({ role: 'STAFF' })).toBe(true)
    expect(isStaff({ role: 'OWNER' })).toBe(true)
  })
})

describe('one-time tokens', () => {
  it('confirms an email once; the link cannot be reused', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const token = await issueToken(user.id, 'EMAIL_VERIFICATION')
    expect(await verifyEmailToken(token)).toBe(true)
    expect(await verifyEmailToken(token)).toBe(false)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull()
  })

  it('will not accept a token for a different purpose, or an expired one', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const token = await issueToken(user.id, 'EMAIL_VERIFICATION')
    expect(await consumeToken(token, 'PASSWORD_RESET')).toBeNull()

    const expired = await issueToken(user.id, 'PASSWORD_RESET')
    await db.verificationToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await consumeToken(expired, 'PASSWORD_RESET')).toBeNull()
  })

  it('a new reset link cancels the previous one', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const older = await issueToken(user.id, 'PASSWORD_RESET')
    const newer = await issueToken(user.id, 'PASSWORD_RESET')
    expect(await consumeToken(older, 'PASSWORD_RESET')).toBeNull()
    expect(await consumeToken(newer, 'PASSWORD_RESET')).toBe(user.id)
  })

  it('two simultaneous uses of one token: exactly one succeeds', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const token = await issueToken(user.id, 'PASSWORD_RESET')
    const results = await Promise.all([consumeToken(token, 'PASSWORD_RESET'), consumeToken(token, 'PASSWORD_RESET')])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('a password reset changes the password and signs out every device', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: email('reg') } })
    const { token: sessionToken } = await createSessionRecord(user.id)
    const resetToken = await issueToken(user.id, 'PASSWORD_RESET')

    expect(await resetPasswordWithToken(resetToken, 'a brand new password')).toBe(user.id)
    expect(await findSessionUser(sessionToken)).toBeNull()
    expect(await authenticate(email('reg'), PASSWORD)).toBeNull()
    expect(await authenticate(email('reg'), 'a brand new password')).toBe(user.id)
  })
})

describe('rate limiting', () => {
  it('allows the limit, blocks the next attempt, and resets', async () => {
    const key = `${tag}-rl`
    for (let i = 0; i < 3; i++) expect((await consumeRateLimit(key, 3, 60)).allowed).toBe(true)
    const blocked = await consumeRateLimit(key, 3, 60)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    await resetRateLimit(key)
    expect((await consumeRateLimit(key, 3, 60)).allowed).toBe(true)
  })

  it('counts concurrent attempts exactly', async () => {
    const key = `${tag}-rl-concurrent`
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit(key, 5, 60)))
    expect(results.filter((r) => r.allowed)).toHaveLength(5)
  })

  it('starts a fresh window once the old one has passed', async () => {
    const key = `${tag}-rl-window`
    await consumeRateLimit(key, 1, 60)
    expect((await consumeRateLimit(key, 1, 60)).allowed).toBe(false)
    await db.rateLimit.update({ where: { key }, data: { windowStart: new Date(Date.now() - 61_000) } })
    expect((await consumeRateLimit(key, 1, 60)).allowed).toBe(true)
  })
})

describe('safeReturnPath', () => {
  it('only allows same-site paths after sign-in', () => {
    expect(safeReturnPath('/account/orders')).toBe('/account/orders')
    expect(safeReturnPath('https://evil.example')).toBe('/account')
    expect(safeReturnPath('//evil.example')).toBe('/account')
    expect(safeReturnPath('/\\evil.example')).toBe('/account')
    expect(safeReturnPath(null)).toBe('/account')
  })
})
