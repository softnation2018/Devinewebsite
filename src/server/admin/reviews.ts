import 'server-only'
import type { ReviewStatus } from '@/generated/prisma/client'
import { db } from '../db'
import { recordAudit } from './audit'
import { findClaims } from './products'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { PENDING: 'Waiting', APPROVED: 'Published', REJECTED: 'Not published' }

export async function listReviewsForStaff(status: ReviewStatus) {
  const rows = await db.review.findMany({
    where: { status },
    orderBy: { updatedAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100,
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      status: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      product: { select: { name: true, slug: true } },
      order: { select: { id: true, orderNumber: true } },
    },
  })
  // Customers write in their own words, but a published review that says a
  // product cures or guarantees something still reads as a claim by the shop.
  return rows.map((r) => ({ ...r, claims: findClaims(`${r.title ?? ''}\n${r.body ?? ''}`) }))
}

export async function moderateReview(id: string, to: 'APPROVED' | 'REJECTED', actor: { id: string; ip: string | null }) {
  return db.$transaction(async (tx) => {
    const before = await tx.review.findUnique({ where: { id }, select: { status: true, productId: true } })
    if (!before) return { ok: false as const, error: 'Review not found.' }
    if (before.status === to) return { ok: true as const }
    await tx.review.update({ where: { id }, data: { status: to, moderatedByUserId: actor.id, moderatedAt: new Date() } })
    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: to === 'APPROVED' ? 'review.approve' : 'review.reject',
      entityType: 'Review',
      entityId: id,
      before: { status: before.status },
      after: { status: to },
    })
    return { ok: true as const }
  })
}
