// Coupon management for staff. A coupon's code and discount are fixed once
// it has been used, so past orders always match the coupon they name.

import { z } from 'zod'
import type { CouponType } from '@/generated/prisma/client'
import { parseRupeesToPaise } from '@/lib/money'
import { db } from '../db'
import { normaliseCouponCode } from '../shop/coupons'
import { recordAudit } from './audit'
import type { StaffResult } from './orders'

type Actor = { id: string; ip: string | null }

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  PERCENTAGE: 'Percentage off',
  FIXED: 'Fixed amount off',
  FREE_SHIPPING: 'Free shipping',
}

/** "2026-11-01T09:30" typed in the admin form, read as India time. */
export function parseIstLocal(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input.trim())
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The reverse, for filling the form. */
export function toIstLocal(date: Date | null): string {
  if (!date) return ''
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16)
}

export function listCoupons() {
  return db.coupon.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] })
}

export function getCoupon(id: string) {
  return db.coupon.findUnique({ where: { id } })
}

const money = (label: string) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null
    const p = parseRupeesToPaise(s)
    if (p === null) ctx.addIssue({ code: 'custom', message: `${label}: enter an amount in rupees.` })
    return p
  })

const count = (label: string) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null
    if (!/^\d{1,7}$/.test(s.trim()) || Number(s) < 1) {
      ctx.addIssue({ code: 'custom', message: `${label}: enter a whole number of at least 1, or leave it empty.` })
      return null
    }
    return Number(s)
  })

const when = (label: string) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null
    const d = parseIstLocal(s)
    if (!d) ctx.addIssue({ code: 'custom', message: `${label}: choose a date and time.` })
    return d
  })

const couponSchema = z
  .object({
    code: z
      .string()
      .transform(normaliseCouponCode)
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, 'Code: 3 to 40 letters or numbers, no spaces.')),
    description: z
      .string()
      .max(200)
      .transform((s) => s.trim() || null),
    type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']),
    percent: z.string(),
    amount: money('Discount amount'),
    minOrder: money('Minimum order'),
    maxDiscount: money('Maximum discount'),
    usageLimitTotal: count('Total uses'),
    usageLimitPerUser: count('Uses per customer'),
    startsAt: when('Starts'),
    endsAt: when('Ends'),
    isActive: z.boolean(),
  })
  .transform((v, ctx) => {
    let valueBp: number | null = null
    let valuePaise: number | null = null
    if (v.type === 'PERCENTAGE') {
      const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(v.percent.trim())
      valueBp = m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
      if (!valueBp || valueBp > 9000) ctx.addIssue({ code: 'custom', message: 'Percentage: enter a number from 0.01 to 90.' })
    } else if (v.type === 'FIXED') {
      valuePaise = v.amount
      if (!valuePaise) ctx.addIssue({ code: 'custom', message: 'Discount amount: enter an amount above zero.' })
    }
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: 'custom', message: 'The end must be after the start.' })
    return {
      code: v.code,
      description: v.description,
      type: v.type,
      valueBp,
      valuePaise,
      minOrderPaise: v.minOrder ?? 0,
      maxDiscountPaise: v.type === 'PERCENTAGE' ? v.maxDiscount : null,
      usageLimitTotal: v.usageLimitTotal,
      usageLimitPerUser: v.usageLimitPerUser ?? 1,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      isActive: v.isActive,
    }
  })

export type CouponInput = z.infer<typeof couponSchema>

export function parseCouponForm(formData: FormData): { ok: true; value: CouponInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(formData)
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')
  const parsed = couponSchema.safeParse({
    ...Object.fromEntries(['code', 'description', 'type', 'percent', 'amount', 'minOrder', 'maxDiscount', 'usageLimitTotal', 'usageLimitPerUser', 'startsAt', 'endsAt'].map((k) => [k, str(k)])),
    isActive: raw.isActive === 'on',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' ') }
  return { ok: true, value: parsed.data }
}

const json = (c: CouponInput | Record<string, unknown>) =>
  JSON.parse(JSON.stringify(c, (_k, val) => (val instanceof Date ? val.toISOString() : val)))

export async function createCoupon(v: CouponInput, actor: Actor): Promise<StaffResult & { id?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.coupon.create({ data: v, select: { id: true } })
      await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'coupon.create', entityType: 'Coupon', entityId: c.id, after: json(v) })
      return { ok: true as const, id: c.id }
    })
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') return { ok: false, error: 'A coupon with this code already exists.' }
    throw e
  }
}

const LOCKED_AFTER_USE = ['code', 'type', 'valueBp', 'valuePaise'] as const

export async function updateCoupon(id: string, v: CouponInput, actor: Actor): Promise<StaffResult> {
  try {
    return await db.$transaction(async (tx) => {
      // Locked, as checkout locks it, so a use cannot land between check and save.
      await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${id} FOR UPDATE`
      const c = await tx.coupon.findUnique({ where: { id } })
      if (!c) return { ok: false as const, error: 'Coupon not found.' }
      if (c.timesUsed > 0 && LOCKED_AFTER_USE.some((k) => c[k] !== v[k])) {
        return { ok: false as const, error: 'This coupon has been used, so its code and discount cannot change. End it and create a new one instead.' }
      }
      if (v.usageLimitTotal !== null && v.usageLimitTotal < c.timesUsed) {
        return { ok: false as const, error: `It has already been used ${c.timesUsed} times; the total limit cannot be lower.` }
      }
      await tx.coupon.update({ where: { id }, data: v })
      const keys = Object.keys(v) as (keyof CouponInput)[]
      const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b)
      const changed = keys.filter((k) => !same(c[k], v[k]))
      await recordAudit(tx, {
        actorUserId: actor.id,
        ipAddress: actor.ip,
        action: 'coupon.update',
        entityType: 'Coupon',
        entityId: id,
        before: json(Object.fromEntries(changed.map((k) => [k, c[k]]))),
        after: json(Object.fromEntries(changed.map((k) => [k, v[k]]))),
      })
      return { ok: true as const }
    })
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') return { ok: false, error: 'A coupon with this code already exists.' }
    throw e
  }
}
