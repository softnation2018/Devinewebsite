import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ProductGrid } from '@/components/ProductCard'
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

// Params are awaited outside any Suspense boundary so an unknown slug
// returns a real 404 status (see the product page for the reasoning).
export default async function CategoryPage({ params }: PageProps<'/category/[slug]'>) {
  const { slug } = await params
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
