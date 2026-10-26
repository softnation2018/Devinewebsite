import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ProductGrid } from '@/components/ProductCard'
import { ProductGridSkeleton } from '@/components/ProductGridSkeleton'
import { searchProducts } from '@/server/catalog'

export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true },
}

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <>
      <PageHeader title="Search" />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Suspense fallback={<ProductGridSkeleton />}>
          {searchParams.then(({ q }) => (
            <Results query={typeof q === 'string' ? q : ''} />
          ))}
        </Suspense>
      </div>
    </>
  )
}

async function Results({ query }: { query: string }) {
  const q = query.trim()
  if (q.length < 2) {
    return <EmptyState title="What are you looking for?" body="Type at least two letters into the search box." />
  }
  const products = await searchProducts(q)
  if (products.length === 0) {
    return <EmptyState title={`No results for “${q}”`} body="Try a different word, such as yantra, mala or bracelet." />
  }
  return (
    <>
      <p className="mb-6 text-sm text-stone" role="status">
        {products.length} {products.length === 1 ? 'result' : 'results'} for “{q}”
      </p>
      <ProductGrid products={products} />
    </>
  )
}
