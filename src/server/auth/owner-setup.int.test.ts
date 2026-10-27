import { afterAll, describe, expect, it } from 'vitest'

process.env.AUTH_SECRET ??= 'unit-test-secret-0123456789abcdef'

import { db } from '../db'
import { createFirstOwner, ownerSetupToken, ownerSetupTokenValid } from './owner-setup'

const email = `it-owner-${Date.now()}@example.test`

afterAll(async () => {
  await db.user.deleteMany({ where: { email } })
  await db.$disconnect()
})

describe('first owner setup', () => {
  it('accepts only the token made from AUTH_SECRET', () => {
    const t = ownerSetupToken()!
    expect(ownerSetupTokenValid(t)).toBe(true)
    expect(ownerSetupTokenValid(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'))).toBe(false)
    expect(ownerSetupTokenValid('')).toBe(false)
    expect(ownerSetupTokenValid(undefined)).toBe(false)
  })

  it('refuses a wrong token, and refuses once an owner exists', async () => {
    expect(await createFirstOwner('nope', { email, password: 'long-enough-1', name: '' })).toMatchObject({ ok: false })
    await db.user.create({ data: { email, role: 'OWNER' } })
    expect(await createFirstOwner(ownerSetupToken(), { email: `x${email}`, password: 'long-enough-1', name: '' })).toEqual({
      ok: false,
      error: 'The shop already has an owner. Please sign in instead.',
    })
    expect(await db.user.count({ where: { email: `x${email}` } })).toBe(0)
  })
})
