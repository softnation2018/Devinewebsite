import type { Metadata } from 'next'
import { cacheLife, cacheTag } from 'next/cache'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { db } from '@/server/db'
import { listPublishedLegalPages } from '@/server/catalog'

async function getPublishedPage(slug: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('legal')
  return db.legalPage.findFirst({
    where: { slug, isPublished: true },
    select: { slug: true, title: true, bodyMarkdown: true, seoTitle: true, seoDescription: true },
  })
}

export async function generateStaticParams() {
  const pages = await listPublishedLegalPages()
  // At least one param is required for the build to validate this route.
  return pages.length > 0 ? pages.map((p) => ({ slug: p.slug })) : [{ slug: 'privacy' }]
}

export async function generateMetadata({ params }: PageProps<'/policies/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const page = await getPublishedPage(slug)
  if (!page) return {}
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `/policies/${page.slug}` },
  }
}

// Policy text is shown as plain paragraphs for now. A Markdown renderer
// with HTML sanitising arrives with the admin page editor (milestone 11).
export default async function PolicyPage({ params }: PageProps<'/policies/[slug]'>) {
  const { slug } = await params
  const page = await getPublishedPage(slug)
  if (!page) notFound()
  return (
    <>
      <PageHeader title={page.title} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-base leading-relaxed whitespace-pre-line sm:px-6">
        {page.bodyMarkdown.replace(/^#.*\n+/, '')}
      </div>
    </>
  )
}
