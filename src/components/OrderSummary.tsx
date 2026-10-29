import { formatPaise } from '@/lib/money'

type Totals = {
  subtotalPaise: number
  discountPaise: number
  prepaidDiscountPaise?: number
  shippingPaise: number
  codFeePaise: number
  taxPaise: number
  totalPaise: number
}

export function OrderSummary({ totals, couponCode }: { totals: Totals; couponCode?: string | null }) {
  return (
    <dl className="space-y-2 text-sm">
      <Row label="Subtotal" value={formatPaise(totals.subtotalPaise)} />
      {totals.discountPaise > 0 && <Row label={`Discount${couponCode ? ` (${couponCode})` : ''}`} value={`− ${formatPaise(totals.discountPaise)}`} />}
      {(totals.prepaidDiscountPaise ?? 0) > 0 && <Row label="Online payment discount" value={`− ${formatPaise(totals.prepaidDiscountPaise!)}`} />}
      <Row label="Shipping" value={totals.shippingPaise === 0 ? 'Free' : formatPaise(totals.shippingPaise)} />
      {totals.codFeePaise > 0 && <Row label="Cash on Delivery fee" value={formatPaise(totals.codFeePaise)} />}
      <div className="flex justify-between border-t border-gold-500/30 pt-3 text-base font-semibold text-maroon-900">
        <dt>Total</dt>
        <dd>{formatPaise(totals.totalPaise)}</dd>
      </div>
      {totals.taxPaise > 0 && <p className="text-xs text-stone">Includes {formatPaise(totals.taxPaise)} GST</p>}
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
