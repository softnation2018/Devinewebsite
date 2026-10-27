import { beforeAll, describe, expect, it } from 'vitest'
import { newsletterToken, readNewsletterToken } from './newsletter-token'

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'unit-test-secret-0123456789abcdef'
})

describe('newsletter links', () => {
  it('round-trips the address for the right purpose only', () => {
    const t = newsletterToken('confirm', 'a@example.test')
    expect(readNewsletterToken('confirm', t)).toBe('a@example.test')
    expect(readNewsletterToken('unsubscribe', t)).toBeNull()
    const u = newsletterToken('unsubscribe', 'a@example.test')
    expect(readNewsletterToken('unsubscribe', u)).toBe('a@example.test')
    expect(readNewsletterToken('confirm', u)).toBeNull()
  })

  it('rejects a changed address or signature', () => {
    const t = newsletterToken('unsubscribe', 'a@example.test')
    const [, mac] = t.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ p: 'unsubscribe', e: 'b@example.test' })).toString('base64url')
    expect(readNewsletterToken('unsubscribe', `${forgedBody}.${mac}`)).toBeNull()
    expect(readNewsletterToken('unsubscribe', `${t}x`)).toBeNull()
    expect(readNewsletterToken('unsubscribe', 'garbage')).toBeNull()
    expect(readNewsletterToken('unsubscribe', `${t}.extra`)).toBeNull()
  })

  it('expires confirmation links after 7 days', () => {
    const now = Date.UTC(2026, 0, 1)
    const t = newsletterToken('confirm', 'a@example.test', now)
    expect(readNewsletterToken('confirm', t, now + 6 * 86_400_000)).toBe('a@example.test')
    expect(readNewsletterToken('confirm', t, now + 8 * 86_400_000)).toBeNull()
  })
})
