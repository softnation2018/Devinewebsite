import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { FormAlert } from '@/components/forms'
import { PageHeader } from '@/components/PageHeader'
import { formatPaise } from '@/lib/money'
import { getAccountOverview } from '@/server/account'
import { requireUser } from '@/server/auth/session'
import { logout } from './actions'
import { FormSkeleton } from './AuthCard'
import { ResendVerificationForm } from './AuthForms'

export const metadata: Metadata = { title: 'My account' }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export default function AccountPage({ searchParams }: PageProps<'/account'>) {
  return (
    <>
      <PageHeader title="My account" />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Suspense fallback={<FormSkeleton />}>
          {searchParams.then((sp) => (
            <Dashboard welcome={sp.welcome === '1'} reset={sp.reset === '1'} />
          ))}
        </Suspense>
      </div>
    </>
  )
}

async function Dashboard({ welcome, reset }: { welcome: boolean; reset: boolean }) {
  const user = await requireUser('/account')
  const { orderCount, recentOrders, addresses } = await getAccountOverview(user.id)

  return (
    <div className="space-y-8">
      {welcome && <FormAlert message="Welcome to Divine Mantra. Your account is ready." />}
      {reset && <FormAlert message="Your password has been changed and you have been signed out on other devices." />}

      {!user.emailVerified && (
        <div className="rounded-sm border border-gold-500/50 bg-gold-100 px-4 py-4 text-sm">
          <p>
            Please confirm your email address. We sent a link to <strong>{user.email}</strong>.
          </p>
          <ResendVerificationForm />
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-serif text-2xl text-maroon-900">Namaste{user.name ? `, ${user.name}` : ''}</p>
          <p className="text-sm text-stone">{user.email}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-sm border border-maroon-900 px-5 py-2 text-sm tracking-[0.12em] text-maroon-900 uppercase hover:bg-maroon-900 hover:text-ivory"
          >
            Sign out
          </button>
        </form>
      </div>

      <section aria-labelledby="orders-heading" className="rounded-sm border border-gold-500/30 bg-white p-6">
        <h2 id="orders-heading" className="font-serif text-xl text-maroon-900">
          Orders <span className="text-base text-stone">({orderCount})</span>
        </h2>
        {recentOrders.length === 0 ? (
          <p className="mt-3 text-sm text-stone">
            You have not placed an order yet.{' '}
            <Link href="/shop" className="text-maroon-800 underline underline-offset-2">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gold-500/20">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <Link href={`/order/${o.orderNumber}`} className="font-medium text-maroon-800 underline underline-offset-2">
                  {o.orderNumber}
                </Link>
                <span className="text-stone">{dateFormat.format(o.placedAt)}</span>
                <span>{STATUS_LABEL[o.status] ?? o.status}</span>
                <span className="font-medium">{formatPaise(o.totalPaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="addresses-heading" className="rounded-sm border border-gold-500/30 bg-white p-6">
        <h2 id="addresses-heading" className="font-serif text-xl text-maroon-900">
          Saved addresses
        </h2>
        {addresses.length === 0 ? (
          <p className="mt-3 text-sm text-stone">Addresses you use at checkout will be saved here.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {addresses.map((a) => (
              <li key={a.id} className="rounded-sm border border-stone/20 p-4 text-sm">
                <p className="font-medium">
                  {a.fullName} {a.isDefault && <span className="ml-1 text-xs text-gold-500 uppercase">Default</span>}
                </p>
                <p className="text-stone">
                  {[a.line1, a.line2].filter(Boolean).join(', ')}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
