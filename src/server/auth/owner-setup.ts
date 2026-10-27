import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '../db'
import { normaliseEmail } from './accounts'
import { hashPassword, passwordProblem } from './password'

// The first owner account, for hosts where nobody can run psql (Vercel).
// The setup link carries a token derived from AUTH_SECRET, so only someone
// who holds that secret can make it, and nothing secret sits in the code.
// The link stops working as soon as any owner exists.

function secret(): string | null {
  const s = process.env.AUTH_SECRET
  return s && s.length >= 16 ? s : null
}

export function ownerSetupToken(): string | null {
  const s = secret()
  return s ? createHmac('sha256', s).update('owner-setup:v1').digest('base64url') : null
}

export function ownerSetupTokenValid(token: unknown): boolean {
  const expected = ownerSetupToken()
  if (!expected || typeof token !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function ownerExists(): Promise<boolean> {
  return (await db.user.count({ where: { role: 'OWNER' } })) > 0
}

export type OwnerSetupResult = { ok: true; userId: string } | { ok: false; error: string }

export async function createFirstOwner(token: unknown, input: { email: string; password: string; name: string }): Promise<OwnerSetupResult> {
  if (!ownerSetupTokenValid(token)) return { ok: false, error: 'This setup link is not valid.' }
  const email = normaliseEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  const problem = passwordProblem(input.password)
  if (problem) return { ok: false, error: `Password: ${problem}` }
  const passwordHash = await hashPassword(input.password)
  return db.$transaction(async (tx) => {
    // One setup at a time, so two people cannot both become the first owner.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('owner-setup'))`
    if ((await tx.user.count({ where: { role: 'OWNER' } })) > 0) return { ok: false as const, error: 'The shop already has an owner. Please sign in instead.' }
    const name = input.name.trim().slice(0, 100) || null
    const user = await tx.user.upsert({
      where: { email },
      update: { role: 'OWNER', passwordHash, emailVerifiedAt: new Date(), isActive: true, ...(name ? { name } : {}) },
      create: { email, name, role: 'OWNER', passwordHash, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    await tx.auditLog.create({ data: { actorUserId: user.id, action: 'owner.setup', entityType: 'User', entityId: user.id, after: { email } } })
    return { ok: true as const, userId: user.id }
  })
}
