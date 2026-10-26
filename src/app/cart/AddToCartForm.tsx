'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/forms'
import { addToCartAction, type CartActionState } from './actions'

export function AddToCartForm({ productId, maxQuantity }: { productId: string; maxQuantity: number }) {
  const [state, action] = useActionState<CartActionState, FormData>(addToCartAction, {})
  return (
    <form action={action} className="mt-8 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="quantity" className="block text-xs tracking-wider text-stone uppercase">
            Quantity
          </label>
          <select
            id="quantity"
            name="quantity"
            defaultValue="1"
            className="mt-1 rounded-sm border border-stone/40 bg-white px-3 py-3 text-base"
          >
            {Array.from({ length: maxQuantity }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 sm:max-w-xs">
          <SubmitButton pendingText="Adding…">Add to cart</SubmitButton>
        </div>
      </div>
      <div aria-live="polite" className="min-h-6 text-sm">
        {state.error && <p className="text-maroon-700">{state.error}</p>}
        {state.added && !state.error && (
          <p>
            {state.message}{' '}
            <Link href="/cart" className="font-medium text-maroon-800 underline underline-offset-2">
              View cart
            </Link>
          </p>
        )}
      </div>
    </form>
  )
}
