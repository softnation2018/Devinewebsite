import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { OrderSummary } from '@/components/OrderSummary'
import { PageHeader } from '@/components/PageHeader'
import { formatPaise } from '@/lib/money'
import { getCurrentUser } from '@/server/auth/session'
import { orderAccessToken } from '@/server/shop/cart-session'
import { findOrderForViewer } from '@/server/shop/checkout'

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default function OrderPage({ params, searchParams }: PageProps<'/order/[orderNumber]'>) {
  return (
    <>
      <PageHeader title="Your order" />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-sm bg-ivory" aria-hidden="true" />}>
          {Promise.all([params, searchParams]).then(([{ orderNumber }, { key }]) => (
            <Order orderNumber={orderNumber} keyParam={typeof key === 'string' ? key : null} />
          ))}
        </Suspense>
      </div>
    </>
  )
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Waiting for payment confirmation',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

async function Order({ orderNumber, keyParam }: { orderNumber: string; keyParam: string | null }) {
  const [user, cookieToken] = await Promise.all([getCurrentUser(), orderAccessToken()])
  const order =
    (await findOrderForViewer(orderNumber, { userId: user?.id ?? null, accessToken: keyParam })) ??
    (await findOrderForViewer(orderNumber, { userId: null, accessToken: cookieToken }))

  // Same message whether the order is missing or belongs to someone else.
  if (!order) {
    return <EmptyState title="We could not find that order" body="Open the link in your order email, or sign in to the account you ordered with." />
  }

  const address = order.shippingAddress as Record<string, string | null>
  const isCod = order.paymentMethod === 'COD'

  return (
    <div className="space-y-8">
      <div className="rounded-sm border border-gold-500/50 bg-gold-100 px-5 py-4">
        <p className="font-serif text-2xl text-maroon-900">Thank you for your order</p>
        <p className="mt-1 text-sm">
          Order <strong>{order.orderNumber}</strong> · {STATUS_TEXT[order.status] ?? order.status}
        </p>
        {isCod && order.paymentStatus === 'PENDING' && (
          <p className="mt-2 text-sm">Please keep {formatPaise(order.totalPaise)} ready to pay in cash on delivery.</p>
        )}
      </div>

      <section aria-labelledby="items-heading" className="rounded-sm border border-gold-500/30 bg-white p-6">
        <h2 id="items-heading" className="font-serif text-xl text-maroon-900">
          Items
        </h2>
        <ul className="mt-4 space-y-2 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.nameSnapshot}
                {i.variantSnapshot && ` (${i.variantSnapshot})`} <span className="text-stone">× {i.quantity}</span>
              </span>
              <span>{formatPaise(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-gold-500/20 pt-4">
          <OrderSummary totals={order} couponCode={order.couponCode} />
        </div>
      </section>

      <section aria-labelledby="ship-heading" className="rounded-sm border border-gold-500/30 bg-white p-6 text-sm">
        <h2 id="ship-heading" className="font-serif text-xl text-maroon-900">
          Delivering to
        </h2>
        <p className="mt-3">
          {address.fullName}
          <br />
          {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}
          <br />
          {address.city}, {address.state} {address.pincode}
          <br />
          {address.phone}
        </p>
      </section>

      <Link href="/shop" className="inline-block text-sm text-maroon-800 underline underline-offset-2">
        Continue shopping
      </Link>
    </div>
  )
}
