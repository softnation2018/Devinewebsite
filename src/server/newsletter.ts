import 'server-only'
import { normaliseEmail } from './auth/accounts'
import { db } from './db'
import { sendEmail } from './email'
import { newsletterToken, readNewsletterToken } from './newsletter-token'
import { siteUrl } from '@/lib/site'

// Newsletter sign-up with double opt-in: an address is only "confirmed"
// after its owner opens the link we email to it. Links are signed with
// AUTH_SECRET, so nothing extra is stored and they cannot be forged.

/**
 * Records the address and emails a confirmation link. The caller always shows
 * the same message whatever happens here, so the form never reveals who is
 * already subscribed.
 */
export async function requestSubscription(rawEmail: string, source: string): Promise<void> {
  const email = normaliseEmail(rawEmail)
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } })
  if (existing?.isConfirmed && !existing.unsubscribedAt) return
  if (!existing) await db.newsletterSubscriber.create({ data: { email, source } })

  const base = siteUrl()
  await sendEmail({
    to: email,
    subject: 'Confirm your Divine Mantra newsletter sign-up',
    text: `Namaste,\n\nSomeone (hopefully you) asked to receive the Divine Mantra newsletter at this address. To confirm, open this link:\n${base}/newsletter/confirm?token=${newsletterToken('confirm', email)}\n\nThe link works for 7 days. If you did not ask for this, ignore this email and you will not hear from us.\n\nTo stop emails at any time:\n${base}/newsletter/unsubscribe?token=${newsletterToken('unsubscribe', email)}\n\nDivine Mantra`,
  })
}

export async function confirmSubscription(token: string): Promise<boolean> {
  const email = readNewsletterToken('confirm', token)
  if (!email) return false
  const r = await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { isConfirmed: true, confirmedAt: new Date(), unsubscribedAt: null },
  })
  return r.count > 0
}

export async function unsubscribe(token: string): Promise<boolean> {
  const email = readNewsletterToken('unsubscribe', token)
  if (!email) return false
  await db.newsletterSubscriber.updateMany({ where: { email, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } })
  return true
}
