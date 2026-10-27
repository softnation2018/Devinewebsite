import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { formatPaise } from '@/lib/money'
import { categoryNames, COUPON_TYPE_LABEL, listCoupons } from '@/server/admin/coupons'
import { requireCapability } from '@/server/admin/guard'
import { AdminHeading, dateTime } from '../ui'

export const metadata: Metadata = { title: 'Coupons' }

export default function CouponsPage() {
  return (
    <>
      <AdminHeading title="Coupons">
        <Link href="/admin/coupons/new" className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory">
          Add coupon
        </Link>
      </AdminHeading>
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        <Coupons />
      </Suspense>
    </>
  )
}

async function Coupons() {
  await requireCapability('coupons.manage')
  const [coupons, names] = await Promise.all([listCoupons(), categoryNames()])
  const now = new Date()
  if (coupons.length === 0) return <p className="text-sm text-stone">No coupons yet.</p>
  return (
    <div className="overflow-x-auto rounded-sm border border-gold-500/30 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-ivory text-xs text-stone uppercase">
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3">Discount</th>
            <th className="px-3">Minimum</th>
            <th className="px-3">Used</th>
            <th className="px-3">Ends</th>
            <th className="px-3">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold-500/20">
          {coupons.map((c) => {
            const state = !c.isActive ? 'Off' : c.endsAt && c.endsAt <= now ? 'Ended' : c.startsAt && c.startsAt > now ? 'Scheduled' : 'Live'
            return (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <Link href={`/admin/coupons/${c.id}`} className="font-medium text-maroon-800 underline underline-offset-2">
                    {c.code}
                  </Link>
                </td>
                <td className="px-3">
                  {c.type === 'PERCENTAGE' ? `${(c.valueBp ?? 0) / 100}% off` : c.type === 'FIXED' ? `${formatPaise(c.valuePaise ?? 0)} off` : COUPON_TYPE_LABEL[c.type]}
                  {c.appliesToCategory && <span className="block text-xs text-stone">Only {names.get(c.appliesToCategory) ?? 'a removed category'}</span>}
                </td>
                <td className="px-3">{c.minOrderPaise ? formatPaise(c.minOrderPaise) : '—'}</td>
                <td className="px-3">
                  {c.timesUsed}
                  {c.usageLimitTotal !== null && ` of ${c.usageLimitTotal}`}
                </td>
                <td className="px-3 text-stone">{c.endsAt ? dateTime.format(c.endsAt) : 'No end'}</td>
                <td className="px-3">{state}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
