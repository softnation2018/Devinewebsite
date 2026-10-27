// The only place order totals are calculated. Every amount is integer paise.
// Callers pass prices read from the database, never prices sent by a browser.

export type PricingLine = {
  unitPricePaise: number
  quantity: number
  /** GST rate in basis points: 1200 = 12% */
  gstRateBp: number
  /** False when the coupon is limited to other categories. Default true. */
  couponEligible?: boolean
}

export type PricingCoupon =
  | { type: 'PERCENTAGE'; valueBp: number; minOrderPaise: number; maxDiscountPaise: number | null }
  | { type: 'FIXED'; valuePaise: number; minOrderPaise: number }
  | { type: 'FREE_SHIPPING'; minOrderPaise: number }

export type ShippingRule = {
  flatPaise: number
  /** Orders at or above this amount (after discount) ship free. null = never free. */
  freeAbovePaise: number | null
}

export type PricingInput = {
  lines: PricingLine[]
  coupon?: PricingCoupon | null
  shipping: ShippingRule
  paymentMethod: 'RAZORPAY' | 'COD'
  codFeePaise: number
}

export type LineTax = { taxablePaise: number; taxPaise: number }

export type PricingResult = {
  subtotalPaise: number
  discountPaise: number
  shippingPaise: number
  codFeePaise: number
  /** GST contained in the item prices. Prices are GST-inclusive, so this is
   *  already inside the subtotal and is NOT added to the total. */
  taxPaise: number
  totalPaise: number
  lineTaxes: LineTax[]
  couponRejected: 'BELOW_MINIMUM' | 'NO_ELIGIBLE_ITEMS' | null
}

export class PricingError extends Error {}

function assertWholePaise(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PricingError(`${label} must be a non-negative whole number of paise`)
  }
}

export function calculateOrderTotals(input: PricingInput): PricingResult {
  if (input.lines.length === 0) throw new PricingError('An order needs at least one item')

  for (const line of input.lines) {
    assertWholePaise(line.unitPricePaise, 'Unit price')
    assertWholePaise(line.gstRateBp, 'GST rate')
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new PricingError('Quantity must be a whole number of at least 1')
    }
  }
  assertWholePaise(input.shipping.flatPaise, 'Shipping charge')
  assertWholePaise(input.codFeePaise, 'COD fee')

  const lineGross = input.lines.map((l) => l.unitPricePaise * l.quantity)
  const subtotalPaise = lineGross.reduce((a, b) => a + b, 0)
  const eligible = input.lines.map((l) => l.couponEligible !== false)
  // A category coupon counts, and discounts, only the items it covers.
  const eligibleSubtotal = lineGross.reduce((a, g, i) => (eligible[i] ? a + g : a), 0)

  let discountPaise = 0
  let freeShipping = false
  let couponRejected: PricingResult['couponRejected'] = null
  const coupon = input.coupon

  if (coupon) {
    if (eligibleSubtotal === 0) {
      couponRejected = 'NO_ELIGIBLE_ITEMS'
    } else if (eligibleSubtotal < coupon.minOrderPaise) {
      couponRejected = 'BELOW_MINIMUM'
    } else if (coupon.type === 'PERCENTAGE') {
      discountPaise = Math.floor((eligibleSubtotal * coupon.valueBp) / 10_000)
      if (coupon.maxDiscountPaise !== null) {
        discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise)
      }
    } else if (coupon.type === 'FIXED') {
      discountPaise = coupon.valuePaise
    } else {
      freeShipping = true
    }
  }
  discountPaise = Math.min(discountPaise, eligibleSubtotal)

  const afterDiscount = subtotalPaise - discountPaise
  const qualifiesForFree =
    input.shipping.freeAbovePaise !== null && afterDiscount >= input.shipping.freeAbovePaise
  const shippingPaise = freeShipping || qualifiesForFree ? 0 : input.shipping.flatPaise

  const codFeePaise = input.paymentMethod === 'COD' ? input.codFeePaise : 0

  const lineTaxes = extractInclusiveGst(input.lines, lineGross, eligible, discountPaise)
  const taxPaise = lineTaxes.reduce((a, t) => a + t.taxPaise, 0)

  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise,
    totalPaise: afterDiscount + shippingPaise + codFeePaise,
    lineTaxes,
    couponRejected,
  }
}

// Spreads the discount across the lines it applies to, in proportion to
// their value, with the rounding remainder on the last such line so the
// parts always sum to the whole, then splits each discounted line into
// taxable value and the GST inside it.
function extractInclusiveGst(lines: PricingLine[], gross: number[], eligible: boolean[], discountPaise: number): LineTax[] {
  const base = gross.reduce((a, g, i) => (eligible[i] ? a + g : a), 0)
  const lastEligible = eligible.lastIndexOf(true)
  let allocated = 0

  return lines.map((line, i) => {
    const share = !eligible[i]
      ? 0
      : i === lastEligible
        ? discountPaise - allocated
        : base === 0
          ? 0
          : Math.floor((discountPaise * gross[i]) / base)
    allocated += share

    const net = gross[i] - share
    const taxablePaise = Math.round((net * 10_000) / (10_000 + line.gstRateBp))
    return { taxablePaise, taxPaise: net - taxablePaise }
  })
}
