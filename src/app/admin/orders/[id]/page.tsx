import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { OrderSummary } from '@/components/OrderSummary'
import { formatPaise } from '@/lib/money'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'
import { getOrderForStaff } from '@/server/admin/orders'
import { AdminHeading, Badge, dateTime, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../../ui'
import { CancelForm, NoteForm, StatusButton } from './OrderActions'
import { ShippingPanel } from './ShippingPanel'

export const metadata: Metadata = { title: 'Order' }

export default function AdminOrderPage({ params }: PageProps<'/admin/orders/[id]'>) {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      {params.then(({ id }) => (
        <OrderDetail id={id} />
      ))}
    </Suspense>
  )
}

async function OrderDetail({ id }: { id: string }) {
  const user = await requireCapability('orders.view')
  const order = await getOrderForStaff(id)
  if (!order) notFound()
  const address = order.shippingAddress as Record<string, string | null>
  const open = ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/orders" className="text-maroon-800 underline underline-offset-2">
          ← All orders
        </Link>
      </p>
      <AdminHeading title={order.orderNumber}>
        <div className="flex flex-wrap gap-2">
          <Badge value={order.status} label={ORDER_STATUS_LABEL[order.status]} />
          <Badge value={order.paymentStatus} label={`${order.paymentMethod === 'COD' ? 'COD' : 'Online'} · ${PAYMENT_STATUS_LABEL[order.paymentStatus]}`} />
        </div>
      </AdminHeading>

      {order.adminNote && (
        <p className="mb-6 rounded-sm border border-gold-500/60 bg-gold-100 px-4 py-3 text-sm whitespace-pre-line">{order.adminNote}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-sm border border-gold-500/30 bg-white p-5">
            <h2 className="font-serif text-xl text-maroon-900">Items</h2>
            <table className="mt-3 w-full text-left text-sm">
              <tbody className="divide-y divide-gold-500/20">
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      {i.nameSnapshot}
                      {i.variantSnapshot && <span className="text-stone"> ({i.variantSnapshot})</span>}
                      <div className="text-xs text-stone">SKU {i.skuSnapshot}</div>
                    </td>
                    <td className="text-right">
                      {i.quantity} × {formatPaise(i.unitPricePaise)}
                    </td>
                    <td className="w-28 text-right font-medium">{formatPaise(i.lineTotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 border-t border-gold-500/20 pt-4">
              <OrderSummary totals={order} couponCode={order.couponCode} />
            </div>
          </section>

          <section className="rounded-sm border border-gold-500/30 bg-white p-5 text-sm">
            <h2 className="font-serif text-xl text-maroon-900">Payments</h2>
            {order.payments.length === 0 ? (
              <p className="mt-2 text-stone">No payment attempt yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {order.payments.map((p) => (
                  <li key={p.id}>
                    {p.method === 'COD' ? 'Cash on Delivery' : 'Razorpay'} · {formatPaise(p.amountPaise)} · {PAYMENT_STATUS_LABEL[p.status]}
                    {p.providerPaymentId && <span className="text-stone"> · {p.providerPaymentId}</span>}
                    {p.failureReason && <span className="text-stone"> · {p.failureReason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-sm border border-gold-500/30 bg-white p-5 text-sm">
            <h2 className="font-serif text-xl text-maroon-900">History</h2>
            <ul className="mt-2 space-y-1 text-stone">
              <li>Placed {dateTime.format(order.placedAt)}</li>
              {order.confirmedAt && <li>Confirmed {dateTime.format(order.confirmedAt)}</li>}
              {order.cancelledAt && (
                <li>
                  Cancelled {dateTime.format(order.cancelledAt)}: {order.cancelReason}
                </li>
              )}
              {order.movements.map((m, i) => (
                <li key={i}>
                  Stock {m.reason.toLowerCase()} {m.delta > 0 ? '+' : ''}
                  {m.delta} · {dateTime.format(m.createdAt)}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <ShippingPanel role={user.role} order={order} />
          <section className="rounded-sm border border-gold-500/30 bg-white p-5 text-sm">
            <h2 className="font-serif text-xl text-maroon-900">Customer</h2>
            <p className="mt-2">{order.user ? `${order.user.name ?? ''} ${order.user.email}` : `${order.guestEmail} (guest)`}</p>
            <h3 className="mt-4 text-xs tracking-wider text-stone uppercase">Ship to</h3>
            <p className="mt-1">
              {address.fullName}
              <br />
              {[address.line1, address.line2, address.landmark].filter(Boolean).join(', ')}
              <br />
              {address.city}, {address.state} {address.pincode}
              <br />
              {address.phone}
            </p>
            {order.customerNote && (
              <>
                <h3 className="mt-4 text-xs tracking-wider text-stone uppercase">Customer note</h3>
                <p className="mt-1 whitespace-pre-line">{order.customerNote}</p>
              </>
            )}
          </section>

          {can(user.role, 'orders.update') && (
            <section className="space-y-5 rounded-sm border border-gold-500/30 bg-white p-5">
              {order.status === 'CONFIRMED' && <StatusButton orderId={order.id} to="PROCESSING" label="Mark as packing" />}
              {order.status === 'PROCESSING' && <StatusButton orderId={order.id} to="CONFIRMED" label="Move back to confirmed" />}
              <NoteForm orderId={order.id} note={order.adminNote} />
              {open && can(user.role, 'orders.cancel') && <CancelForm orderId={order.id} paid={order.paymentStatus === 'PAID'} />}
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
