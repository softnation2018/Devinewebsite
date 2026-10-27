import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { ProductCard } from '@/components/ProductCard'
import { ProductGridSkeleton } from '@/components/ProductGridSkeleton'
import { requireUser } from '@/server/auth/session'
import { listWishlist } from '@/server/wishlist'
import { setWishlistAction } from '../../product/actions'

export const metadata: Metadata = { title: 'My wishlist', robots: { index: false } }

export default function WishlistPage() {
  return (
    <>
      <PageHeader title="My wishlist" />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Suspense fallback={<ProductGridSkeleton />}>
          <Wishlist />
        </Suspense>
      </div>
    </>
  )
}

async function Wishlist() {
  const user = await requireUser('/account/wishlist')
  const products = await listWishlist(user.id)
  if (products.length === 0) {
    return (
      <p className="text-center text-sm text-stone">
        Nothing saved yet. Tap “Save to wishlist” on any product.{' '}
        <Link href="/shop" className="text-maroon-800 underline underline-offset-2">
          Browse the shop
        </Link>
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="flex flex-col gap-2">
          <ProductCard product={p} />
          <form action={setWishlistAction}>
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="save" value="0" />
            <button type="submit" className="text-sm text-maroon-800 underline underline-offset-2">
              Remove<span className="sr-only"> {p.name}</span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  )
}
