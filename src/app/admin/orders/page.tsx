import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import type { OrderStatus } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { requireCapability } from '@/server/admin/guard'
import { listOrders } from '@/server/admin/orders'
import { AdminHeading, Badge, dateTime, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../ui'

export const metadata: Metadata = { title: 'Orders' }

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]

export default function OrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  return (
    <>
      <AdminHeading title="Orders" />
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        {searchParams.then((sp) => {
          const status = STATUSES.find((s) => s === sp.status)
          const q = typeof sp.q === 'string' ? sp.q : ''
          const page = Number(sp.page) || 1
          return <Orders status={status} q={q} page={page} />
        })}
      </Suspense>
    </>
  )
}

async function Orders({ status, q, page }: { status?: OrderStatus; q: string; page: number }) {
  await requireCapability('orders.view')
  const result = await listOrders({ status, q, page })
  const link = (over: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    const merged = { status, q: q || undefined, page: undefined, ...over }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') params.set(k, String(v))
    const s = params.toString()
    return `/admin/orders${s ? `?${s}` : ''}`
  }

  return (
    <div className="space-y-5">
      <form className="flex flex-wrap gap-2" action="/admin/orders">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="q" className="sr-only">
          Search orders
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Order number, email or phone" className="w-72 max-w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
        <button className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory">Search</button>
      </form>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        <Link href={link({ status: undefined })} className={`rounded-sm border px-3 py-1 ${!status ? 'border-maroon-900 bg-maroon-900 text-ivory' : 'border-stone/30'}`}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={link({ status: s })} className={`rounded-sm border px-3 py-1 ${status === s ? 'border-maroon-900 bg-maroon-900 text-ivory' : 'border-stone/30'}`}>
            {ORDER_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      {result.orders.length === 0 ? (
        <p className="text-sm text-stone">No orders match.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-gold-500/30 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ivory text-xs text-stone uppercase">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3">Placed</th>
                <th className="px-3">Customer</th>
                <th className="px-3">Status</th>
                <th className="px-3">Payment</th>
                <th className="px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-500/20">
              {result.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-maroon-800 underline underline-offset-2">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 text-stone">{dateTime.format(o.placedAt)}</td>
                  <td className="px-3">{o.user?.email ?? o.guestEmail}</td>
                  <td className="px-3">
                    <Badge value={o.status} label={ORDER_STATUS_LABEL[o.status]} />
                  </td>
                  <td className="px-3">
                    {o.deliverySpeed === 'EXPRESS' && <strong className="text-maroon-800">Express · </strong>}
                    {o.paymentMethod === 'COD' ? 'COD' : 'Online'} · <Badge value={o.paymentStatus} label={PAYMENT_STATUS_LABEL[o.paymentStatus]} />
                  </td>
                  <td className="px-3 text-right font-medium">{formatPaise(o.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
          {result.page > 1 && <Link href={link({ page: result.page - 1 })}>← Newer</Link>}
          <span className="text-stone">
            Page {result.page} of {result.pages} ({result.total} orders)
          </span>
          {result.page < result.pages && <Link href={link({ page: result.page + 1 })}>Older →</Link>}
        </nav>
      )}
    </div>
  )
}
