import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'
import { db } from './db'

// Customer reviews. Only customers who received the product (a delivered
// order on their account) can review it, so every published review is a
// verified purchase. Each review, and each edit, waits for staff approval.

export const reviewSchema = z.object({
  rating: z.coerce.number().int('Choose a rating from 1 to 5 stars.').min(1, 'Choose a rating from 1 to 5 stars.').max(5, 'Choose a rating from 1 to 5 stars.'),
  title: z
    .string()
    .trim()
    .max(100, 'Title: at most 100 characters.')
    .transform((s) => s || null),
  body: z
    .string()
    .trim()
    .max(2000, 'Review: at most 2000 characters.')
    .transform((s) => s || null),
})

export type ReviewInput = z.infer<typeof reviewSchema>

/** The most recent delivered order of this customer that contains the product, if any. */
export async function deliveredOrderWith(userId: string, productId: string): Promise<string | null> {
  const order = await db.order.findFirst({
    where: { userId, status: 'DELIVERED', items: { some: { productId } } },
    orderBy: { placedAt: 'desc' },
    select: { id: true },
  })
  return order?.id ?? null
}

export async function getOwnReview(userId: string, productId: string) {
  return db.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { rating: true, title: true, body: true, status: true },
  })
}

export async function submitReview(userId: string, productId: string, input: ReviewInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const orderId = await deliveredOrderWith(userId, productId)
  if (!orderId) return { ok: false, error: 'Only customers who have received this product can review it.' }
  const data = { ...input, orderId, isVerifiedPurchase: true, status: 'PENDING' as const, moderatedByUserId: null, moderatedAt: null }
  await db.review.upsert({
    where: { productId_userId: { productId, userId } },
    create: { productId, userId, ...data },
    update: data,
  })
  return { ok: true }
}

/** Approved reviews for the product page, with the reviewer's first name only. */
export async function getPublishedReviews(productId: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('reviews')
  const rows = await db.review.findMany({
    where: { productId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, rating: true, title: true, body: true, createdAt: true, isVerifiedPurchase: true, user: { select: { name: true } } },
  })
  const agg = await db.review.aggregate({ where: { productId, status: 'APPROVED' }, _avg: { rating: true }, _count: true })
  return {
    count: agg._count,
    average: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 10) / 10,
    reviews: rows.map(({ user, ...r }) => ({ ...r, author: user.name?.trim().split(/\s+/)[0] || 'Customer' })),
  }
}
