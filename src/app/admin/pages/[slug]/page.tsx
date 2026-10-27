import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Markdown } from '@/components/Markdown'
import { requireCapability } from '@/server/admin/guard'
import { getLegalPageForStaff } from '@/server/admin/pages'
import { AdminHeading } from '../../ui'
import { PageForm } from './PageForm'

export const metadata: Metadata = { title: 'Edit page' }

export default function EditPage({ params }: PageProps<'/admin/pages/[slug]'>) {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      {params.then(({ slug }) => (
        <Editor slug={slug} />
      ))}
    </Suspense>
  )
}

async function Editor({ slug }: { slug: string }) {
  await requireCapability('content.edit')
  const page = await getLegalPageForStaff(slug)
  if (!page) notFound()
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/pages" className="text-maroon-800 underline underline-offset-2">
          ← All pages
        </Link>
      </p>
      <AdminHeading title={page.title}>
        {page.isPublished && (
          <Link href={`/policies/${page.slug}`} className="text-sm underline">
            View in shop
          </Link>
        )}
      </AdminHeading>
      <div className="grid gap-8 lg:grid-cols-2">
        <PageForm page={{ slug: page.slug, title: page.title, bodyMarkdown: page.bodyMarkdown, seoTitle: page.seoTitle ?? '', seoDescription: page.seoDescription ?? '', isPublished: page.isPublished }} />
        <section aria-label="Preview of the saved text" className="rounded-sm border border-gold-500/30 bg-white p-5">
          <p className="mb-3 text-xs tracking-wider text-stone uppercase">Preview (last saved)</p>
          <Markdown source={page.bodyMarkdown} className="text-sm leading-relaxed" />
        </section>
      </div>
    </>
  )
}
