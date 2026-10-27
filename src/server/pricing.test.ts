import { describe, expect, it } from 'vitest'
import { calculateOrderTotals, PricingError, type PricingInput } from './pricing'

const base: PricingInput = {
  lines: [{ unitPricePaise: 100_000, quantity: 1, gstRateBp: 1200 }], // ₹1,000 at 12%
  shipping: { flatPaise: 7_900, freeAbovePaise: 99_900 },
  paymentMethod: 'RAZORPAY',
  codFeePaise: 4_900,
}

describe('calculateOrderTotals', () => {
  it('adds up lines and quantities', () => {
    const r = calculateOrderTotals({
      ...base,
      lines: [
        { unitPricePaise: 25_000, quantity: 2, gstRateBp: 1200 },
        { unitPricePaise: 15_050, quantity: 3, gstRateBp: 500 },
      ],
      shipping: { flatPaise: 7_900, freeAbovePaise: null },
    })
    expect(r.subtotalPaise).toBe(95_150)
    expect(r.totalPaise).toBe(95_150 + 7_900)
  })

  it('ships free at or above the threshold, judged after discount', () => {
    expect(calculateOrderTotals(base).shippingPaise).toBe(0)

    const discounted = calculateOrderTotals({
      ...base,
      coupon: { type: 'FIXED', valuePaise: 1_000, minOrderPaise: 0 },
    })
    // ₹1,000 − ₹10 = ₹990, below the ₹999 threshold
    expect(discounted.shippingPaise).toBe(7_900)
  })

  it('caps a percentage coupon at its maximum discount', () => {
    const r = calculateOrderTotals({
      ...base,
      coupon: { type: 'PERCENTAGE', valueBp: 2_000, minOrderPaise: 0, maxDiscountPaise: 10_000 },
    })
    expect(r.discountPaise).toBe(10_000) // 20% would be ₹200, capped at ₹100
  })

  it('never discounts below zero', () => {
    const r = calculateOrderTotals({
      ...base,
      coupon: { type: 'FIXED', valuePaise: 500_000, minOrderPaise: 0 },
      shipping: { flatPaise: 0, freeAbovePaise: null },
    })
    expect(r.discountPaise).toBe(100_000)
    expect(r.totalPaise).toBe(0)
  })

  it('rejects a coupon below its minimum order and charges full price', () => {
    const r = calculateOrderTotals({
      ...base,
      coupon: { type: 'FIXED', valuePaise: 5_000, minOrderPaise: 200_000 },
    })
    expect(r.couponRejected).toBe('BELOW_MINIMUM')
    expect(r.discountPaise).toBe(0)
  })

  it('applies a free-shipping coupon', () => {
    const r = calculateOrderTotals({
      ...base,
      lines: [{ unitPricePaise: 20_000, quantity: 1, gstRateBp: 1200 }],
      coupon: { type: 'FREE_SHIPPING', minOrderPaise: 0 },
    })
    expect(r.shippingPaise).toBe(0)
    expect(r.totalPaise).toBe(20_000)
  })

  it('charges the COD fee only for cash on delivery', () => {
    expect(calculateOrderTotals(base).codFeePaise).toBe(0)
    const cod = calculateOrderTotals({ ...base, paymentMethod: 'COD' })
    expect(cod.codFeePaise).toBe(4_900)
    expect(cod.totalPaise).toBe(100_000 + 4_900)
  })

  it('extracts GST from inclusive prices without adding it to the total', () => {
    const r = calculateOrderTotals(base)
    // ₹1,000 inclusive of 12% → taxable ₹892.86, GST ₹107.14
    expect(r.lineTaxes[0]).toEqual({ taxablePaise: 89_286, taxPaise: 10_714 })
    expect(r.taxPaise).toBe(10_714)
    expect(r.totalPaise).toBe(100_000)
  })

  it('spreads a discount across lines so the parts sum exactly', () => {
    const r = calculateOrderTotals({
      ...base,
      lines: [
        { unitPricePaise: 33_333, quantity: 1, gstRateBp: 1200 },
        { unitPricePaise: 33_333, quantity: 1, gstRateBp: 500 },
        { unitPricePaise: 33_334, quantity: 1, gstRateBp: 0 },
      ],
      coupon: { type: 'FIXED', valuePaise: 10_001, minOrderPaise: 0 },
    })
    const netSum = r.lineTaxes.reduce((a, t) => a + t.taxablePaise + t.taxPaise, 0)
    expect(netSum).toBe(r.subtotalPaise - r.discountPaise)
    expect(r.lineTaxes[2].taxPaise).toBe(0)
  })

  it('discounts only the lines a category coupon covers, and counts the minimum on them alone', () => {
    const lines = [
      { unitPricePaise: 60_000, quantity: 1, gstRateBp: 0, couponEligible: true },
      { unitPricePaise: 40_000, quantity: 1, gstRateBp: 1200, couponEligible: false },
    ]
    const r = calculateOrderTotals({ ...base, lines, coupon: { type: 'PERCENTAGE', valueBp: 1_000, minOrderPaise: 0, maxDiscountPaise: null } })
    expect(r.discountPaise).toBe(6_000)
    // The other line keeps its full value, and so its full GST.
    expect(r.lineTaxes[1].taxablePaise + r.lineTaxes[1].taxPaise).toBe(40_000)
    expect(r.lineTaxes[0].taxablePaise).toBe(54_000)

    const fixed = calculateOrderTotals({ ...base, lines, coupon: { type: 'FIXED', valuePaise: 90_000, minOrderPaise: 0 } })
    expect(fixed.discountPaise).toBe(60_000)

    const short = calculateOrderTotals({ ...base, lines, coupon: { type: 'FIXED', valuePaise: 5_000, minOrderPaise: 70_000 } })
    expect(short).toMatchObject({ discountPaise: 0, couponRejected: 'BELOW_MINIMUM' })

    const none = calculateOrderTotals({ ...base, lines: [lines[1]], coupon: { type: 'FIXED', valuePaise: 5_000, minOrderPaise: 0 } })
    expect(none).toMatchObject({ discountPaise: 0, couponRejected: 'NO_ELIGIBLE_ITEMS' })
  })

  it('refuses malformed input instead of guessing', () => {
    expect(() => calculateOrderTotals({ ...base, lines: [] })).toThrow(PricingError)
    expect(() =>
      calculateOrderTotals({ ...base, lines: [{ unitPricePaise: 100, quantity: 0, gstRateBp: 0 }] }),
    ).toThrow(PricingError)
    expect(() =>
      calculateOrderTotals({ ...base, lines: [{ unitPricePaise: 99.5, quantity: 1, gstRateBp: 0 }] }),
    ).toThrow(PricingError)
    expect(() =>
      calculateOrderTotals({ ...base, lines: [{ unitPricePaise: -1, quantity: 1, gstRateBp: 0 }] }),
    ).toThrow(PricingError)
  })
})
