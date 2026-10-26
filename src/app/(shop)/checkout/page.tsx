import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { OrderSummary } from '@/components/OrderSummary'
import { PageHeader } from '@/components/PageHeader'
import { formatPaise } from '@/lib/money'
import { getCurrentUser } from '@/server/auth/session'
import { db } from '@/server/db'
import { getCommerceSettings, onlinePaymentAvailable } from '@/server/settings'
import { getCartCouponCode } from '@/server/shop/cart'
import { currentCartId } from '@/server/shop/cart-session'
import { paymentOptions, quoteCart } from '@/server/shop/checkout'
import { CheckoutForm } from './CheckoutForm'

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } }

export default function CheckoutPage() {
  return (
    <>
      <PageHeader title="Checkout" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-sm bg-ivory" aria-hidden="true" />}>
          <Checkout />
        </Suspense>
      </div>
    </>
  )
}

async function Checkout() {
  const cartId = await currentCartId()
  if (!cartId) return <EmptyState title="Your cart is empty" body="Add something to your cart before checking out." />

  const [user, settings, couponCode] = await Promise.all([getCurrentUser(), getCommerceSettings(), getCartCouponCode(cartId)])
  const quote = await quoteCart(cartId, { settings, paymentMethod: 'RAZORPAY', couponCode, userId: user?.id ?? null, email: null })
  if (quote.lines.length === 0) return <EmptyState title="Your cart is empty" body="Add something to your cart before checking out." />
  if (quote.hasProblems || !quote.totals) redirect('/cart')

  const options = paymentOptions(quote.totals.totalPaise, settings, onlinePaymentAvailable())
  const saved = user
    ? await db.address.findFirst({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] })
    : null

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div>
        {!user && (
          <p className="mb-6 text-sm text-stone">
            Checking out as a guest.{' '}
            <Link href="/account/login?next=/checkout" className="text-maroon-800 underline underline-offset-2">
              Sign in
            </Link>{' '}
            to use saved addresses.
          </p>
        )}
        {!options.online && !options.cod ? (
          <p role="alert" className="rounded-sm border border-maroon-700/40 bg-maroon-700/5 px-4 py-3 text-sm text-maroon-800">
            Orders cannot be placed right now because no payment method is available. Please check back soon.
          </p>
        ) : (
          <CheckoutForm
            signedInEmail={user?.email ?? null}
            defaults={
              saved
                ? {
                    fullName: saved.fullName,
                    phone: saved.phone,
                    line1: saved.line1,
                    line2: saved.line2 ?? '',
                    landmark: saved.landmark ?? '',
                    city: saved.city,
                    state: saved.state,
                    pincode: saved.pincode,
                  }
                : { fullName: user?.name ?? '' }
            }
            online={options.online}
            cod={options.cod}
            codReason={options.codReason}
            codFeePaise={settings.codFeePaise}
          />
        )}
      </div>

      <aside aria-labelledby="summary-heading" className="h-fit space-y-5 rounded-sm border border-gold-500/30 bg-white p-6">
        <h2 id="summary-heading" className="font-serif text-xl text-maroon-900">
          Your order
        </h2>
        <ul className="space-y-2 text-sm">
          {quote.lines.map((l) => (
            <li key={l.itemId} className="flex justify-between gap-3">
              <span>
                {l.name} <span className="text-stone">× {l.quantity}</span>
              </span>
              <span>{formatPaise(l.unitPricePaise * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <OrderSummary totals={quote.totals} couponCode={quote.coupon?.ok ? quote.coupon.code : null} />
        <Link href="/cart" className="block text-sm text-maroon-800 underline underline-offset-2">
          Edit cart
        </Link>
      </aside>
    </div>
  )
}
