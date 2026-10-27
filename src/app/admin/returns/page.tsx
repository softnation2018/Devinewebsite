import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireCapability } from '@/server/admin/guard'
import { listReturnsForStaff, RETURN_REASONS, RETURN_STATUS_LABEL, type ReturnReason } from '@/server/returns'
import { AdminHeading, Badge, dateTime } from '../ui'

export const metadata: Metadata = { title: 'Returns' }

export default function ReturnsPage({ searchParams }: PageProps<'/admin/returns'>) {
  return (
    <>
      <AdminHeading title="Returns" />
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>{searchParams.then((sp) => <Returns all={sp.all === '1'} />)}</Suspense>
    </>
  )
}

async function Returns({ all }: { all: boolean }) {
  await requireCapability('orders.view')
  const returns = await listReturnsForStaff(!all)
  return (
    <>
      <p className="mb-4 text-sm">
        {all ? (
          <Link href="/admin/returns" className="text-maroon-800 underline">
            Show only open returns
          </Link>
        ) : (
          <Link href="/admin/returns?all=1" className="text-maroon-800 underline">
            Show all returns
          </Link>
        )}
      </p>
      {returns.length === 0 ? (
        <p className="text-sm text-stone">No returns here.</p>
      ) : (
        <ul className="divide-y divide-gold-500/20 rounded-sm border border-gold-500/30 bg-white">
          {returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link href={`/admin/orders/${r.order.id}`} className="font-medium text-maroon-800 underline underline-offset-2">
                {r.order.orderNumber}
              </Link>
              <span>{RETURN_REASONS[r.reason as ReturnReason] ?? r.reason}</span>
              <span className="text-stone">{dateTime.format(r.requestedAt)}</span>
              <Badge value={r.status} label={RETURN_STATUS_LABEL[r.status]} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
