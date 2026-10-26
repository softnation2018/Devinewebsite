import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { formatPaise } from '@/lib/money'
import { can } from '@/server/admin/access'
import { getDashboard } from '@/server/admin/dashboard'
import { requireCapability } from '@/server/admin/guard'
import { AdminHeading } from './ui'

export const metadata: Metadata = { title: 'Dashboard' }

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      <Dashboard />
    </Suspense>
  )
}

async function Dashboard() {
  const user = await requireCapability('dashboard.view')
  const d = await getDashboard()
  const tiles = [
    { label: 'Orders today', value: String(d.ordersToday), href: '/admin/orders' },
    { label: 'Paid online today', value: formatPaise(d.paidTodayPaise), href: '/admin/orders' },
    { label: 'To pack', value: String(d.toPack), href: '/admin/orders?status=CONFIRMED' },
    { label: 'Awaiting payment', value: String(d.awaitingPayment), href: '/admin/orders?status=PENDING' },
    { label: 'COD not yet collected', value: String(d.codOpen), href: '/admin/orders' },
  ]
  return (
    <>
      <AdminHeading title="Dashboard" />
      {d.decisions > 0 && (
        <div className="mb-6 rounded-sm border border-gold-500/60 bg-gold-100 px-4 py-3 text-sm">
          <strong>{d.decisions} store settings</strong> are still placeholders waiting for your decision (shipping charges, COD, returns, business details).{' '}
          {can(user.role, 'settings.edit') ? (
            <Link href="/admin/settings" className="font-medium text-maroon-800 underline underline-offset-2">
              Review settings
            </Link>
          ) : (
            'Ask the owner to review them.'
          )}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="block rounded-sm border border-gold-500/30 bg-white p-4 hover:border-maroon-800">
              <p className="text-xs tracking-wider text-stone uppercase">{t.label}</p>
              <p className="mt-2 font-serif text-3xl text-maroon-900">{t.value}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="low-stock" className="mt-10">
        <h2 id="low-stock" className="font-serif text-xl text-maroon-900">
          Low stock
        </h2>
        {d.lowStock.length === 0 ? (
          <p className="mt-2 text-sm text-stone">No published product is at or below its low-stock level.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-stone uppercase">
              <tr>
                <th className="py-2">Product</th>
                <th>SKU</th>
                <th className="text-right">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-500/20">
              {d.lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">{p.name}</td>
                  <td className="text-stone">{p.sku}</td>
                  <td className={`text-right font-medium ${p.available === 0 ? 'text-maroon-700' : ''}`}>{p.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
