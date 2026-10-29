import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { OrderSummary } from '@/components/OrderSummary'
import { PageHeader } from '@/components/PageHeader'
import { formatPaise } from '@/lib/money'
import { getCurrentUser } from '@/server/auth/session'
import { getCommerceSettings, onlinePaymentAvailable } from '@/server/settings'
import { getCartCouponCode, MAX_LINE_QUANTITY } from '@/server/shop/cart'
import { currentCartId } from '@/server/shop/cart-session'
import { quoteCart } from '@/server/shop/checkout'
import { CouponForm, LineQuantity } from './CartControls'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: true } }

const PROBLEM_TEXT = {
  UNAVAILABLE: 'No longer available. Please remove it.',
  OUT_OF_STOCK: 'Sold out. Please remove it.',
  NOT_ENOUGH_STOCK: 'Fewer left than you chose. Please lower the quantity.',
} as const

export default function CartPage() {
  return (
    <>
      <PageHeader title="Your cart" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-sm bg-ivory" aria-hidden="true" />}>
          <Cart />
        </Suspense>
      </div>
    </>
  )
}

async function Cart() {
  const cartId = await currentCartId()
  if (!cartId) return <EmptyState title="Your cart is empty" body="Browse the collection and add something you like." />

  const [user, settings, couponCode] = await Promise.all([getCurrentUser(), getCommerceSettings(), getCartCouponCode(cartId)])
  const quote = await quoteCart(cartId, { settings, couponCode, userId: user?.id ?? null, email: null })
  if (quote.lines.length === 0) {
    return <EmptyState title="Your cart is empty" body="Browse the collection and add something you like." />
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="sr-only">
          Items
        </h2>
        <ul className="divide-y divide-gold-500/20 border-y border-gold-500/20">
          {quote.lines.map((l) => (
            <li key={l.itemId} className="flex gap-4 py-5">
              <div
                aria-hidden="true"
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm bg-ivory font-serif text-2xl text-gold-500"
              >
                ॐ
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/product/${l.slug}`} className="font-serif text-lg leading-snug text-charcoal hover:text-maroon-800">
                      {l.name}
                    </Link>
                    {l.variantName && <p className="text-xs text-stone">{l.variantName}</p>}
                    {l.isDemo && <p className="text-xs text-maroon-800">Demo product</p>}
                  </div>
                  <p className="shrink-0 text-sm font-medium">{formatPaise(l.unitPricePaise * l.quantity)}</p>
                </div>
                <p className="text-xs text-stone">{formatPaise(l.unitPricePaise)} each</p>
                <LineQuantity itemId={l.itemId} quantity={l.quantity} max={Math.min(MAX_LINE_QUANTITY, Math.max(l.available, 1))} name={l.name} />
                {l.problem && (
                  <p role="alert" className="text-sm text-maroon-700">
                    {PROBLEM_TEXT[l.problem]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Link href="/shop" className="mt-6 inline-block text-sm text-maroon-800 underline underline-offset-2">
          Continue shopping
        </Link>
      </section>

      <aside aria-labelledby="summary-heading" className="h-fit space-y-6 rounded-sm border border-gold-500/30 bg-white p-6">
        <h2 id="summary-heading" className="font-serif text-xl text-maroon-900">
          Order summary
        </h2>
        <CouponForm appliedCode={couponCode} problem={quote.coupon && !quote.coupon.ok ? quote.coupon.message : null} />
        {quote.totals && <OrderSummary totals={quote.totals} couponCode={quote.coupon?.ok ? quote.coupon.code : null} />}
        {quote.totals && settings.shippingFreeAbovePaise !== null && quote.totals.shippingPaise > 0 && (
          <p className="text-xs text-stone">
            Add {formatPaise(settings.shippingFreeAbovePaise - (quote.totals.subtotalPaise - quote.totals.discountPaise))} more for free shipping.
          </p>
        )}
        {onlinePaymentAvailable() && settings.standardPrepaidDiscountBp > 0 && (
          <p className="rounded-sm bg-gold-300/30 px-3 py-2 text-sm text-maroon-900">
            Pay online at checkout and save {settings.standardPrepaidDiscountBp / 100}%
            {settings.expressEnabled && settings.expressPrepaidDiscountBp > settings.standardPrepaidDiscountBp
              ? ` (${settings.expressPrepaidDiscountBp / 100}% with Express delivery)`
              : ''}
            .
          </p>
        )}
        {quote.hasProblems ? (
          <p className="text-sm text-maroon-700">Please fix the items marked above before checking out.</p>
        ) : (
          <Link
            href="/checkout"
            className="block w-full rounded-sm bg-maroon-900 px-6 py-3 text-center text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800"
          >
            Checkout
          </Link>
        )}
      </aside>
    </div>
  )
}
