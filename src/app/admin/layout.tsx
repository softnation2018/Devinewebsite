import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin | Divine Mantra' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  // The whole shell, navigation included, renders only after the staff
  // check, so nothing of the admin area is shown to anyone else.
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm-white" aria-hidden="true" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireCapability('dashboard.view')
  const links = [
    { href: '/admin', label: 'Dashboard', show: true },
    { href: '/admin/orders', label: 'Orders', show: can(user.role, 'orders.view') },
    { href: '/admin/reviews', label: 'Reviews', show: can(user.role, 'reviews.moderate') },
    { href: '/admin/messages', label: 'Messages', show: can(user.role, 'orders.view') },
    { href: '/admin/returns', label: 'Returns', show: can(user.role, 'orders.view') },
    { href: '/admin/products', label: 'Products', show: can(user.role, 'products.view') },
    { href: '/admin/coupons', label: 'Coupons', show: can(user.role, 'coupons.manage') },
    { href: '/admin/pages', label: 'Pages', show: can(user.role, 'content.edit') },
    { href: '/admin/settings', label: 'Settings', show: can(user.role, 'settings.edit') },
  ]
  return (
    <div className="flex min-h-screen flex-col bg-warm-white text-charcoal">
      <header className="bg-maroon-950 text-ivory">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className="font-serif text-xl tracking-wider text-gold-300">
            Divine Mantra · Admin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ivory/70">
              {user.email} ({user.role.toLowerCase()})
            </span>
            <Link href="/" className="underline underline-offset-2">
              View shop
            </Link>
          </div>
        </div>
        <nav aria-label="Admin" className="border-t border-gold-500/20">
          <ul className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 text-sm sm:px-6">
            {links
              .filter((l) => l.show)
              .map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-gold-300">
                    {l.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
