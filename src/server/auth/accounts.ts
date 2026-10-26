// Account logic with no cookies or request objects, so it can be tested
// directly against the database. Server actions in src/app/account wrap it.

import type { TokenPurpose } from '@/generated/prisma/client'
import { db } from '../db'
import { hashPassword, verifyPassword } from './password'
import { deleteAllSessionsForUser } from './session-store'
import { hashToken, newToken } from './tokens'

export const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = {
  EMAIL_VERIFICATION: 24 * 60,
  PASSWORD_RESET: 30,
  PHONE_OTP: 10,
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type RegisterResult = { ok: true; userId: string } | { ok: false; reason: 'EMAIL_TAKEN' }

export async function registerUser(input: { email: string; password: string; name: string }): Promise<RegisterResult> {
  const email = normaliseEmail(input.email)
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  // A row with no password (the seeded owner, or later a guest-checkout
  // customer) still counts as taken: its owner sets a password through
  // "Forgot password", which proves they control the mailbox.
  if (existing) return { ok: false, reason: 'EMAIL_TAKEN' }
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim() || null,
      passwordHash: await hashPassword(input.password),
      profile: { create: {} },
    },
    select: { id: true },
  })
  return { ok: true, userId: user.id }
}

/** Returns the user id when the email and password match an active account. */
export async function authenticate(emailInput: string, password: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { email: normaliseEmail(emailInput) },
    select: { id: true, passwordHash: true, isActive: true },
  })
  // verifyPassword runs a real hash check even when the user is missing,
  // so response time does not reveal which emails have accounts.
  const valid = await verifyPassword(user?.passwordHash ?? null, password)
  if (!user || !valid || !user.isActive) return null
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return user.id
}

/** Creates a single-use token. Older unused tokens of the same purpose are revoked. */
export async function issueToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const token = newToken()
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    db.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000),
      },
    }),
  ])
  return token
}

/**
 * Marks a token used and returns its user id. The conditional update means
 * two simultaneous requests with the same token cannot both succeed.
 */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!token || token.length > 100) return null
  const tokenHash = hashToken(token)
  const { count } = await db.verificationToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (count !== 1) return null
  const row = await db.verificationToken.findUnique({ where: { tokenHash }, select: { userId: true } })
  return row?.userId ?? null
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const userId = await consumeToken(token, 'EMAIL_VERIFICATION')
  if (!userId) return false
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  return true
}

/** Sets a new password and signs the user out of every device. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<string | null> {
  const userId = await consumeToken(token, 'PASSWORD_RESET')
  if (!userId) return null
  await db.user.update({
    where: { id: userId },
    // Following a reset link proves control of the mailbox.
    data: { passwordHash: await hashPassword(newPassword), emailVerifiedAt: new Date() },
  })
  await deleteAllSessionsForUser(userId)
  return userId
}

export async function findActiveUserIdByEmail(email: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email: normaliseEmail(email) }, select: { id: true, isActive: true } })
  return user?.isActive ? user.id : null
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeReturnPath(next: unknown, fallback = '/account'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback
  return next
}
