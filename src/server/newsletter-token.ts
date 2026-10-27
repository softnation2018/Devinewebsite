import { createHmac, timingSafeEqual } from 'node:crypto'

// Signed links for the newsletter. Signing with AUTH_SECRET means nothing
// extra is stored and a link cannot be made up for someone else's address.

const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type Purpose = 'confirm' | 'unsubscribe'

/** Sign-up is offered only when AUTH_SECRET is set (at least 16 characters). */
export function newsletterAvailable(): boolean {
  return (process.env.AUTH_SECRET ?? '').length >= 16
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) throw new Error('AUTH_SECRET is not set')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`newsletter:${payload}`).digest('base64url')
}

export function newsletterToken(purpose: Purpose, email: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify(purpose === 'confirm' ? { p: purpose, e: email, t: now } : { p: purpose, e: email })).toString('base64url')
  return `${body}.${sign(body)}`
}

/** Returns the email the token was made for, or null if it is forged, for another purpose or expired. */
export function readNewsletterToken(purpose: Purpose, token: string, now = Date.now()): string | null {
  const [body, mac, extra] = token.split('.')
  if (!body || !mac || extra !== undefined) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { p?: unknown; e?: unknown; t?: unknown }
    if (data.p !== purpose || typeof data.e !== 'string') return null
    if (purpose === 'confirm' && (typeof data.t !== 'number' || now - data.t > CONFIRM_TTL_MS || data.t > now + 60_000)) return null
    return data.e
  } catch {
    return null
  }
}

