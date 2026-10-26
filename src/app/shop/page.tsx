import type { Metadata } from 'next'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ProductGrid } from '@/components/ProductCard'
import { listProducts } from '@/server/catalog'

export const metadata: Metadata = {
  title: 'Shop all products',
  description: 'Every Divine Mantra product: yantras, rudraksha, malas, bracelets and devotional items.',
  alternates: { canonical: '/shop' },
}

export default async function ShopPage() {
  const products = await listProducts()
  return (
    <>
      <PageHeader title="Shop all" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <EmptyState title="No products yet" body="New products are being added. Please check back soon." />
        )}
      </div>
    </>
  )
}
