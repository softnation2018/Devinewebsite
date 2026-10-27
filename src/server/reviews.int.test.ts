import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from './db'

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const { getPublishedReviews, submitReview } = await import('./reviews')
const { moderateReview, listReviewsForStaff } = await import('./admin/reviews')
const { isInWishlist, listWishlist, setWishlisted } = await import('./wishlist')

const tag = `it-rev-${Date.now()}`
let buyer: string, other: string, staff: string, productId: string

async function order(userId: string, status: 'DELIVERED' | 'SHIPPED', n: number) {
  return db.order.create({
    data: {
      orderNumber: `${tag}-${n}`,
      userId,
      status,
      paymentMethod: 'COD',
      subtotalPaise: 10_000,
      totalPaise: 10_000,
      shippingAddress: {},
      billingAddress: {},
      items: { create: { productId, nameSnapshot: 'Mala', skuSnapshot: 'X', quantity: 1, unitPricePaise: 10_000, lineTotalPaise: 10_000 } },
    },
  })
}

beforeAll(async () => {
  const mk = (s: string, role: 'CUSTOMER' | 'STAFF' = 'CUSTOMER') => db.user.create({ data: { email: `${tag}-${s}@example.test`, name: `Asha ${s}`, role } })
  ;[buyer, other, staff] = (await Promise.all([mk('buyer'), mk('other'), mk('staff', 'STAFF')])).map((u) => u.id)
  productId = (await db.product.create({ data: { slug: tag, sku: tag.toUpperCase(), name: 'Test mala', pricePaise: 10_000, status: 'PUBLISHED' } })).id
  await order(buyer, 'DELIVERED', 1)
  await order(other, 'SHIPPED', 2)
})

afterAll(async () => {
  await db.order.deleteMany({ where: { orderNumber: { startsWith: tag } } })
  await db.auditLog.deleteMany({ where: { actorUserId: staff } })
  await db.product.deleteMany({ where: { slug: tag } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('reviews', () => {
  it('refuses customers whose order has not been delivered', async () => {
    expect(await submitReview(other, productId, { rating: 5, title: null, body: null })).toMatchObject({ ok: false })
  })

  it('stores a delivered buyer’s review as pending and verified', async () => {
    expect(await submitReview(buyer, productId, { rating: 4, title: 'Nice', body: 'Good beads, helps me cure stress.' })).toEqual({ ok: true })
    const r = await db.review.findUniqueOrThrow({ where: { productId_userId: { productId, userId: buyer } } })
    expect(r).toMatchObject({ status: 'PENDING', isVerifiedPurchase: true, rating: 4 })
    expect((await getPublishedReviews(productId)).count).toBe(0)
    const [listed] = (await listReviewsForStaff('PENDING')).filter((x) => x.id === r.id)
    expect(listed.claims.forbidden).toContain('cure')
  })

  it('publishes after approval, audited, showing only the first name', async () => {
    const r = await db.review.findUniqueOrThrow({ where: { productId_userId: { productId, userId: buyer } } })
    expect(await moderateReview(r.id, 'APPROVED', { id: staff, ip: null })).toEqual({ ok: true })
    const pub = await getPublishedReviews(productId)
    expect(pub).toMatchObject({ count: 1, average: 4 })
    expect(pub.reviews[0].author).toBe('Asha')
    expect(await db.auditLog.count({ where: { entityId: r.id, action: 'review.approve' } })).toBe(1)
  })

  it('an edit goes back for checking', async () => {
    await submitReview(buyer, productId, { rating: 5, title: null, body: 'Updated' })
    expect((await db.review.findUniqueOrThrow({ where: { productId_userId: { productId, userId: buyer } } })).status).toBe('PENDING')
    expect((await getPublishedReviews(productId)).count).toBe(0)
  })
})

describe('wishlist', () => {
  it('saves, lists and removes a product, once', async () => {
    expect(await setWishlisted(other, productId, true)).toBe(true)
    expect(await setWishlisted(other, productId, true)).toBe(true)
    expect((await listWishlist(other)).map((p) => p.id)).toEqual([productId])
    expect(await isInWishlist(other, productId)).toBe(true)
    expect(await setWishlisted(other, productId, false)).toBe(false)
    expect(await listWishlist(other)).toEqual([])
  })

  it('will not save an unpublished product', async () => {
    const draft = await db.product.create({ data: { slug: `${tag}-d`, sku: `${tag}-D`.toUpperCase(), name: 'Draft', pricePaise: 100, status: 'DRAFT' } })
    expect(await setWishlisted(other, draft.id, true)).toBe(false)
    await db.product.delete({ where: { id: draft.id } })
  })
})
