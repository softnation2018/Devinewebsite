import { timingSafeEqual } from 'node:crypto'

/** Scheduled jobs must send "Authorization: Bearer <CRON_SECRET>" (Vercel Cron does this). */
export function isAuthorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}
