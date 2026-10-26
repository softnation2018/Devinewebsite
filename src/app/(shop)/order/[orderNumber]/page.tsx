import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { OrderSummary } from '@/components/OrderSummary'
import { PageHeader } from '@/components/PageHeader'
import { formatPaise } from '@/lib/money'
import { onlinePaymentAvailable } from '@/server/settings'
import { PayButton } from '../PayButton'
import { loadViewableOrder } from '../viewer'

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
  const found = await loadViewableOrder(orderNumber, keyParam)
  const order = found?.order

  // Same message whether the order is missing or belongs to someone else.
  if (!order) {
    return <EmptyState title="We could not find that order" body="Open the link in your order email, or sign in to the account you ordered with." />
  }

  const address = order.shippingAddress as Record<string, string | null>
  const isCod = order.paymentMethod === 'COD'
  const awaitingPayment = order.paymentMethod === 'RAZORPAY' && order.status === 'PENDING' && order.paymentStatus === 'PENDING'

  return (
    <div className="space-y-8">
      {awaitingPayment ? (
        <div className="space-y-4 rounded-sm border border-gold-500/50 bg-gold-100 px-5 py-4">
          <div>
            <p className="font-serif text-2xl text-maroon-900">Complete your payment</p>
            <p className="mt-1 text-sm">
              Order <strong>{order.orderNumber}</strong> is reserved for you for 30 minutes. It is confirmed once Razorpay confirms your payment.
            </p>
          </div>
          {onlinePaymentAvailable() ? (
            <PayButton orderNumber={order.orderNumber} accessKey={keyParam} totalPaise={order.totalPaise} />
          ) : (
            <p className="text-sm text-maroon-800">Online payment is not available right now.</p>
          )}
        </div>
      ) : order.status === 'CANCELLED' ? (
        <div className="rounded-sm border border-maroon-700/40 bg-maroon-700/5 px-5 py-4">
          <p className="font-serif text-2xl text-maroon-900">This order was cancelled</p>
          <p className="mt-1 text-sm">
            Order <strong>{order.orderNumber}</strong>
            {order.paymentMethod === 'RAZORPAY' && order.paymentStatus !== 'PAID' ? ' was not paid in time, so the items were released.' : '.'}
          </p>
        </div>
      ) : (
        <div className="rounded-sm border border-gold-500/50 bg-gold-100 px-5 py-4">
          <p className="font-serif text-2xl text-maroon-900">Thank you for your order</p>
          <p className="mt-1 text-sm">
            Order <strong>{order.orderNumber}</strong> · {STATUS_TEXT[order.status] ?? order.status}
            {order.paymentStatus === 'PAID' && ' · Paid'}
          </p>
          {isCod && order.paymentStatus === 'PENDING' && (
            <p className="mt-2 text-sm">Please keep {formatPaise(order.totalPaise)} ready to pay in cash on delivery.</p>
          )}
        </div>
      )}

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

      {order.shipments[0] && <Tracking shipment={order.shipments[0]} />}

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

const SHIPMENT_TEXT: Record<string, string> = {
  CREATED: 'Packed and booked with the courier',
  PICKUP_SCHEDULED: 'Waiting for the courier to collect it',
  IN_TRANSIT: 'On its way',
  OUT_FOR_DELIVERY: 'Out for delivery today',
  NDR: 'The courier could not deliver it; they will try again or contact you',
  DELIVERED: 'Delivered',
  RTO_IN_TRANSIT: 'Being returned to us',
  RTO_DELIVERED: 'Returned to us',
}

const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })

function Tracking({
  shipment: s,
}: {
  shipment: { status: string; courierName: string | null; awbNumber: string | null; trackingUrl: string | null; events: { id: string; status: string; location: string | null; occurredAt: Date }[] }
}) {
  return (
    <section aria-labelledby="track-heading" className="rounded-sm border border-gold-500/30 bg-white p-6 text-sm">
      <h2 id="track-heading" className="font-serif text-xl text-maroon-900">
        Delivery
      </h2>
      <p className="mt-3 font-medium">{SHIPMENT_TEXT[s.status] ?? s.status}</p>
      <p className="mt-1 text-stone">
        {s.courierName && `${s.courierName} · `}Tracking number {s.awbNumber}
      </p>
      {s.trackingUrl && (
        <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-maroon-800 underline underline-offset-2">
          Track on the courier’s website
        </a>
      )}
      {s.events.length > 0 && (
        <>
          <h3 className="mt-5 text-xs tracking-wider text-stone uppercase">Updates from the courier</h3>
          <ol className="mt-2 space-y-2 border-l border-gold-500/40 pl-4">
            {s.events.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.status}</span>
                {e.location && <span className="text-stone"> · {e.location}</span>}
                <div className="text-xs text-stone">{when.format(e.occurredAt)}</div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
