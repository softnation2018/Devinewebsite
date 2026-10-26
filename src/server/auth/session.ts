import 'server-only'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionUser,
  isStaff,
  type SessionUser,
} from './session-store'

const secure = process.env.NODE_ENV === 'production'
// The __Host- prefix makes browsers refuse the cookie unless it is Secure,
// has Path=/ and no Domain, which blocks subdomain cookie injection.
const COOKIE = secure ? '__Host-dm_session' : 'dm_session'

export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

export async function startSession(userId: string): Promise<void> {
  const h = await headers()
  const { token, expiresAt } = await createSessionRecord(userId, {
    ipAddress: await clientIp(),
    userAgent: h.get('user-agent'),
  })
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  await deleteSessionRecord(jar.get(COOKIE)?.value)
  jar.delete(COOKIE)
}

/** The signed-in user, or null. Reads cookies, so call it inside <Suspense>. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return findSessionUser((await cookies()).get(COOKIE)?.value)
}

export async function requireUser(returnTo = '/account'): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect(`/account/login?next=${encodeURIComponent(returnTo)}`)
  return user
}

/**
 * For every admin page and admin action. Customers get a 404, not a
 * "forbidden" page, so the admin area's existence is not advertised.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!isStaff(user)) notFound()
  return user!
}
