import Link from 'next/link'
import { Suspense } from 'react'
import { cartItemCount } from '@/server/shop/cart'
import { currentCartId } from '@/server/shop/cart-session'

async function Count() {
  const cartId = await currentCartId()
  const count = cartId ? await cartItemCount(cartId) : 0
  if (count === 0) return <span className="sr-only">, empty</span>
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[11px] font-semibold text-maroon-950">
      {count}
      <span className="sr-only"> items</span>
    </span>
  )
}

export function CartLink() {
  return (
    <Link href="/cart" className="relative flex items-center gap-2 rounded-sm p-2 text-gold-300 hover:text-gold-100">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M5 7h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 7Z" />
        <path d="M9 7V6a3 3 0 0 1 6 0v1" />
      </svg>
      <span className="sr-only lg:not-sr-only lg:text-sm">Cart</span>
      {/* The count depends on this visitor's cookie, so it streams in
          separately and the rest of the header stays cached. */}
      <Suspense fallback={null}>
        <Count />
      </Suspense>
    </Link>
  )
}
