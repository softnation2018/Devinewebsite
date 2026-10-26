// Database side of sessions, kept free of cookies() so it can be tested
// directly. The cookie side lives in session.ts.

import type { UserRole } from '@/generated/prisma/client'
import { db } from '../db'
import { hashToken, newToken } from './tokens'

export const SESSION_DAYS = 30

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: UserRole
  emailVerified: boolean
}

export async function createSessionRecord(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({
    data: {
      userId,
      sessionToken: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    },
  })
  return { token, expiresAt }
}

export async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null
  const session = await db.session.findUnique({
    where: { sessionToken: hashToken(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, email: true, name: true, role: true, isActive: true, emailVerifiedAt: true } },
    },
  })
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null
  const { user } = session
  return { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerifiedAt !== null }
}

export async function deleteSessionRecord(token: string | undefined): Promise<void> {
  if (!token) return
  await db.session.deleteMany({ where: { sessionToken: hashToken(token) } })
}

/** Signs a user out everywhere, e.g. after a password reset. */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } })
}

const STAFF_ROLES: readonly UserRole[] = ['STAFF', 'ADMIN', 'OWNER']

export function isStaff(user: Pick<SessionUser, 'role'> | null): boolean {
  return user !== null && STAFF_ROLES.includes(user.role)
}
