import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ProductGrid } from '@/components/ProductCard'
import { ProductGridSkeleton } from '@/components/ProductGridSkeleton'
import { getCategoryWithProducts, listCategories } from '@/server/catalog'

export async function generateStaticParams() {
  const categories = await listCategories()
  return categories.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps<'/category/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategoryWithProducts(slug)
  if (!category) return {}
  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description ?? `Shop ${category.name} at Divine Mantra.`,
    alternates: { canonical: `/category/${category.slug}` },
  }
}

// Params are awaited inside <Suspense>, as the Cache Components guide
// requires with Partial Prefetching. Awaiting them at the top level broke
// these pages with a 500 when the catalogue cache was refreshed. An unknown
// slug therefore streams the not-found page with a noindex tag (HTTP 200).
export default function CategoryPage({ params }: PageProps<'/category/[slug]'>) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      {params.then(({ slug }) => (
        <CategoryPageContent slug={slug} />
      ))}
    </Suspense>
  )
}

async function CategoryPageContent({ slug }: { slug: string }) {
  const category = await getCategoryWithProducts(slug)
  if (!category) notFound()

  return (
    <>
      <PageHeader title={category.name}>
        {category.nameHi && <p lang="hi">{category.nameHi}</p>}
        {category.description && <p className="mt-2">{category.description}</p>}
      </PageHeader>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Shop', href: '/shop' }, { name: category.name }]} />
        <div className="mt-6">
          {category.products.length > 0 ? (
            <ProductGrid products={category.products} />
          ) : (
            <EmptyState title="Nothing here yet" body={`Products for ${category.name} are on their way.`} />
          )}
        </div>
      </div>
    </>
  )
}
