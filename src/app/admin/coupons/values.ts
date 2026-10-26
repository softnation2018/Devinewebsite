import type { Coupon } from '@/generated/prisma/client'
import { paiseToRupeeInput } from '@/lib/money'
import { toIstLocal } from '@/server/admin/coupons'
import type { CouponFormValues } from './CouponForm'

export const EMPTY_COUPON: CouponFormValues = {
  id: null,
  code: '',
  description: '',
  type: 'PERCENTAGE',
  percent: '',
  amount: '',
  minOrder: '',
  maxDiscount: '',
  usageLimitTotal: '',
  usageLimitPerUser: '1',
  startsAt: '',
  endsAt: '',
  isActive: true,
}

const rupees = (p: number | null) => (p ? paiseToRupeeInput(p) : '')

export function couponFormValues(c: Coupon): CouponFormValues {
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? '',
    type: c.type,
    percent: c.valueBp ? String(c.valueBp / 100) : '',
    amount: rupees(c.valuePaise),
    minOrder: rupees(c.minOrderPaise),
    maxDiscount: rupees(c.maxDiscountPaise),
    usageLimitTotal: c.usageLimitTotal === null ? '' : String(c.usageLimitTotal),
    usageLimitPerUser: String(c.usageLimitPerUser),
    startsAt: toIstLocal(c.startsAt),
    endsAt: toIstLocal(c.endsAt),
    isActive: c.isActive,
  }
}
