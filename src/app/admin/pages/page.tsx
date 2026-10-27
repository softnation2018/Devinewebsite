import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireCapability } from '@/server/admin/guard'
import { listLegalPagesForStaff } from '@/server/admin/pages'
import { AdminHeading, dateTime } from '../ui'

export const metadata: Metadata = { title: 'Pages' }

export default function PagesPage() {
  return (
    <>
      <AdminHeading title="Pages" />
      <p className="mb-6 max-w-2xl text-sm text-stone">
        Your policies and information pages. Each starts as a draft and appears in the shop only after you publish it. Have policies reviewed by a qualified professional before publishing.
      </p>
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        <Pages />
      </Suspense>
    </>
  )
}

async function Pages() {
  await requireCapability('content.edit')
  const pages = await listLegalPagesForStaff()
  return (
    <ul className="divide-y divide-gold-500/20 rounded-sm border border-gold-500/30 bg-white">
      {pages.map((p) => (
        <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <Link href={`/admin/pages/${p.slug}`} className="font-medium text-maroon-800 underline underline-offset-2">
            {p.title}
          </Link>
          <span className="text-stone">
            {p.isPublished ? 'Published' : 'Draft'} · updated {dateTime.format(p.updatedAt)}
          </span>
        </li>
      ))}
    </ul>
  )
}
