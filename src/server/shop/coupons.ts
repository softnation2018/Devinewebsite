import type { Prisma } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { db } from '../db'
import type { PricingCoupon, PricingLine } from '../pricing'

type Client = Prisma.TransactionClient | typeof db

export type CouponCheck =
  | {
      ok: true
      id: string
      code: string
      pricing: PricingCoupon
      /** The categories it covers (one category and its sub-categories), or null for the whole cart. */
      categoryIds: string[] | null
      categoryName: string | null
    }
  | { ok: false; message: string }

/** What a coupon needs to know about each cart line. */
export type CouponLine = { categoryId: string | null; unitPricePaise: number; quantity: number }

function covers(categoryIds: string[] | null, line: { categoryId: string | null }) {
  return categoryIds === null || (line.categoryId !== null && categoryIds.includes(line.categoryId))
}

/** Pricing lines for these cart lines, marking which ones the coupon may discount. */
export function pricingLines(lines: (CouponLine & { gstRateBp: number })[], coupon: CouponCheck | null): PricingLine[] {
  const ids = coupon?.ok ? coupon.categoryIds : null
  return lines.map((l) => ({ unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBp: l.gstRateBp, couponEligible: covers(ids, l) }))
}

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
  ctx: { lines: CouponLine[]; userId: string | null; email: string | null },
): Promise<CouponCheck> {
  const code = normaliseCouponCode(rawCode)
  const invalid = { ok: false, message: 'This code is not valid.' } as const
  if (!code) return invalid

  const c = await client.coupon.findUnique({ where: { code } })
  const now = new Date()
  if (!c || !c.isActive || (c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt <= now)) return invalid

  let categoryIds: string[] | null = null
  let categoryName: string | null = null
  if (c.appliesToCategory) {
    const cat = await client.category.findUnique({ where: { id: c.appliesToCategory }, select: { name: true, children: { select: { id: true } } } })
    // The category was removed: the coupon no longer means anything.
    if (!cat) return invalid
    categoryIds = [c.appliesToCategory, ...cat.children.map((ch) => ch.id)]
    categoryName = cat.name
  }

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

  const eligibleSubtotal = ctx.lines.filter((l) => covers(categoryIds, l)).reduce((a, l) => a + l.unitPricePaise * l.quantity, 0)
  if (categoryName && eligibleSubtotal === 0) {
    return { ok: false, message: `This code is for ${categoryName} items. Add one to your cart to use it.` }
  }
  if (eligibleSubtotal < c.minOrderPaise) {
    return {
      ok: false,
      message: `Add ${formatPaise(c.minOrderPaise - eligibleSubtotal)} more${categoryName ? ` of ${categoryName} items` : ''} to use this code.`,
    }
  }

  let pricing: PricingCoupon
  if (c.type === 'PERCENTAGE' && c.valueBp !== null && c.valueBp > 0 && c.valueBp <= 10_000) {
    pricing = { type: 'PERCENTAGE', valueBp: c.valueBp, minOrderPaise: c.minOrderPaise, maxDiscountPaise: c.maxDiscountPaise }
  } else if (c.type === 'FIXED' && c.valuePaise !== null && c.valuePaise > 0) {
    pricing = { type: 'FIXED', valuePaise: c.valuePaise, minOrderPaise: c.minOrderPaise }
  } else if (c.type === 'FREE_SHIPPING' && !categoryIds) {
    pricing = { type: 'FREE_SHIPPING', minOrderPaise: c.minOrderPaise }
  } else {
    return invalid
  }
  return { ok: true, id: c.id, code: c.code, pricing, categoryIds, categoryName }
}
