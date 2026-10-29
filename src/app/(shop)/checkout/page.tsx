import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
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
  const quote = await quoteCart(cartId, { settings, couponCode, userId: user?.id ?? null, email: null })
  if (quote.lines.length === 0) return <EmptyState title="Your cart is empty" body="Add something to your cart before checking out." />
  if (quote.hasProblems || !quote.totals || !quote.choices) redirect('/cart')

  const options = paymentOptions(quote.totals.totalPaise, settings, onlinePaymentAvailable())
  const saved = user ? await db.address.findFirst({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }) : null

  const items = (
    <>
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
      <Link href="/cart" className="block text-sm text-maroon-800 underline underline-offset-2">
        Edit cart
      </Link>
    </>
  )

  return (
    <>
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
          options={options}
          choices={quote.choices}
          codFeePaise={settings.codFeePaise}
          expressPercent={settings.expressPrepaidDiscountBp / 100}
          standardPercent={settings.standardPrepaidDiscountBp / 100}
          items={items}
          couponCode={quote.coupon?.ok ? quote.coupon.code : null}
        />
      )}
    </>
  )
}
