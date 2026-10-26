import type { Prisma } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { db } from '../db'
import type { PricingCoupon } from '../pricing'

type Client = Prisma.TransactionClient | typeof db

export type CouponCheck =
  | { ok: true; id: string; code: string; pricing: PricingCoupon }
  | { ok: false; message: string }

export function normaliseCouponCode(code: string): string {
  return code.trim().toUpperCase().slice(0, 40)
}

/**
 * Whether a coupon may be used right now by this customer on a cart of this
 * value. Checkout calls it again inside the order transaction, with the
 * coupon row locked, so usage limits hold under concurrent orders.
 */
export async function checkCoupon(
  client: Client,
  rawCode: string,
  ctx: { subtotalPaise: number; userId: string | null; email: string | null },
): Promise<CouponCheck> {
  const code = normaliseCouponCode(rawCode)
  const invalid = { ok: false, message: 'This code is not valid.' } as const
  if (!code) return invalid

  const c = await client.coupon.findUnique({ where: { code } })
  const now = new Date()
  if (!c || !c.isActive || (c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt <= now)) return invalid

  // Category-restricted coupons need per-line discounting, which is not
  // built yet. Refuse them rather than apply them to the whole cart.
  if (c.appliesToCategory) return invalid

  if (c.usageLimitTotal !== null && c.timesUsed >= c.usageLimitTotal) {
    return { ok: false, message: 'This code has reached its usage limit.' }
  }

  if (ctx.userId || ctx.email) {
    const used = await client.couponUsage.count({
      where: {
        couponId: c.id,
        OR: [
          ...(ctx.userId ? [{ userId: ctx.userId }] : []),
          ...(ctx.email ? [{ order: { guestEmail: ctx.email } }] : []),
        ],
      },
    })
    if (used >= c.usageLimitPerUser) return { ok: false, message: 'You have already used this code.' }
  }

  if (ctx.subtotalPaise < c.minOrderPaise) {
    return { ok: false, message: `Add ${formatPaise(c.minOrderPaise - ctx.subtotalPaise)} more to use this code.` }
  }

  let pricing: PricingCoupon
  if (c.type === 'PERCENTAGE' && c.valueBp !== null && c.valueBp > 0 && c.valueBp <= 10_000) {
    pricing = { type: 'PERCENTAGE', valueBp: c.valueBp, minOrderPaise: c.minOrderPaise, maxDiscountPaise: c.maxDiscountPaise }
  } else if (c.type === 'FIXED' && c.valuePaise !== null && c.valuePaise > 0) {
    pricing = { type: 'FIXED', valuePaise: c.valuePaise, minOrderPaise: c.minOrderPaise }
  } else if (c.type === 'FREE_SHIPPING') {
    pricing = { type: 'FREE_SHIPPING', minOrderPaise: c.minOrderPaise }
  } else {
    return invalid
  }
  return { ok: true, id: c.id, code: c.code, pricing }
}
