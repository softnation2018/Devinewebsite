import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from './db'

vi.mock('./settings', async (orig) => ({
  ...(await orig<typeof import('./settings')>()),
  getSupportSettings: async () => ({ email: 'support@example.test', phone: '', whatsapp: '', hours: '' }),
}))
const sent: { to: string; subject: string; text: string }[] = []
vi.mock('./email', () => ({ sendEmail: async (e: { to: string; subject: string; text: string }) => (sent.push(e), { sent: true }) }))

const { createInquiry } = await import('./contact')
const { confirmSubscription, requestSubscription, unsubscribe } = await import('./newsletter')
const { newsletterToken } = await import('./newsletter-token')
const { saveLegalPage } = await import('./admin/pages')
const { updateInquiry } = await import('./admin/inquiries')

const tag = `it-content-${Date.now()}`
let staff: { id: string; ip: string }

beforeAll(async () => {
  process.env.AUTH_SECRET ??= 'int-test-secret-0123456789abcdef'
  const u = await db.user.create({ data: { email: `${tag}-owner@example.test`, role: 'OWNER' } })
  staff = { id: u.id, ip: '127.0.0.1' }
})

afterAll(async () => {
  await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: tag } } })
  await db.supportInquiry.deleteMany({ where: { email: { startsWith: tag } } })
  await db.legalPage.deleteMany({ where: { slug: { startsWith: 'it-content' } } })
  await db.auditLog.deleteMany({ where: { actorUserId: staff.id } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('newsletter double opt-in', () => {
  const email = `${tag}-reader@example.test`

  it('stores an unconfirmed address and emails a link', async () => {
    sent.length = 0
    await requestSubscription(email.toUpperCase(), 'footer')
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })
    expect(row).toMatchObject({ isConfirmed: false, confirmedAt: null, source: 'footer' })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(email)
    expect(sent[0].text).toContain('/newsletter/confirm?token=')
  })

  it('confirms only with a valid link', async () => {
    expect(await confirmSubscription('not-a-token')).toBe(false)
    expect(await confirmSubscription(newsletterToken('unsubscribe', email))).toBe(false)
    expect(await confirmSubscription(newsletterToken('confirm', email))).toBe(true)
    expect(await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).toMatchObject({ isConfirmed: true, unsubscribedAt: null })
  })

  it('does not email a confirmed subscriber again', async () => {
    sent.length = 0
    await requestSubscription(email, 'footer')
    expect(sent).toHaveLength(0)
  })

  it('unsubscribes, and a new sign-up needs confirming again', async () => {
    expect(await unsubscribe(newsletterToken('unsubscribe', email))).toBe(true)
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).unsubscribedAt).not.toBeNull()
    sent.length = 0
    await requestSubscription(email, 'footer')
    expect(sent).toHaveLength(1)
  })
})

describe('contact messages', () => {
  it('stores the message, notifies support, and staff updates are audited', async () => {
    sent.length = 0
    await createInquiry(
      { name: 'Asha', email: `${tag}-asha@example.test`, phone: '', orderNumber: 'DM-1', subject: 'Size of mala', message: 'How long is the 108 bead mala?' },
      null,
    )
    const m = await db.supportInquiry.findFirstOrThrow({ where: { email: `${tag}-asha@example.test` } })
    expect(m).toMatchObject({ status: 'OPEN', phone: null, orderNumber: 'DM-1' })
    expect(sent.map((s) => s.to)).toEqual(['support@example.test'])

    expect(await updateInquiry(m.id, 'RESOLVED', 'Replied by email', staff)).toEqual({ ok: true })
    expect(await db.supportInquiry.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: 'RESOLVED', adminNote: 'Replied by email' })
    expect(await db.auditLog.count({ where: { entityId: m.id, action: 'inquiry.update' } })).toBe(1)
    // Saving the same values again writes nothing.
    await updateInquiry(m.id, 'RESOLVED', 'Replied by email', staff)
    expect(await db.auditLog.count({ where: { entityId: m.id, action: 'inquiry.update' } })).toBe(1)
  })
})

describe('policy pages', () => {
  const slug = 'it-content-terms'
  const text = 'These are the terms of sale for this shop. '.repeat(6)

  beforeAll(async () => {
    await db.legalPage.create({ data: { slug, title: 'Terms', bodyMarkdown: '# Terms\n\nDraft placeholder.', isPublished: false } })
  })

  it('refuses to publish placeholder, short or unreviewed text', async () => {
    const base = { title: 'Terms', seoTitle: null, seoDescription: null, publish: true }
    expect((await saveLegalPage(slug, { ...base, bodyMarkdown: `Draft placeholder. ${text}`, reviewed: true }, staff)).ok).toBe(false)
    expect((await saveLegalPage(slug, { ...base, bodyMarkdown: 'Too short.', reviewed: true }, staff)).ok).toBe(false)
    expect((await saveLegalPage(slug, { ...base, bodyMarkdown: text, reviewed: false }, staff)).ok).toBe(false)
    expect((await db.legalPage.findUniqueOrThrow({ where: { slug } })).isPublished).toBe(false)
  })

  it('publishes reviewed text and records who did it', async () => {
    const r = await saveLegalPage(slug, { title: 'Terms of sale', bodyMarkdown: text, seoTitle: null, seoDescription: null, publish: true, reviewed: true }, staff)
    expect(r.ok).toBe(true)
    expect(await db.legalPage.findUniqueOrThrow({ where: { slug } })).toMatchObject({ isPublished: true, title: 'Terms of sale' })
    expect(await db.auditLog.count({ where: { entityId: slug, action: 'page.update', actorUserId: staff.id } })).toBe(1)
  })
})
