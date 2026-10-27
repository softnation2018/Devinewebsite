'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { SubmitButton } from '@/components/forms'
import { addToCartAction, type CartActionState } from './actions'

export function AddToCartForm({ productId, variantId, maxQuantity, price }: { productId: string; variantId?: string; maxQuantity: number; price?: string }) {
  const [state, action] = useActionState<CartActionState, FormData>(addToCartAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [offscreen, setOffscreen] = useState(false)

  // On phones the button scrolls away under the description; keep a copy at
  // the bottom of the screen while the form itself is out of view.
  useEffect(() => {
    const el = formRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (offscreen) document.body.dataset.buybar = ''
    else delete document.body.dataset.buybar
    return () => {
      delete document.body.dataset.buybar
    }
  }, [offscreen])

  return (
    <form ref={formRef} action={action} className="mt-8 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}
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
      {offscreen && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-gold-500/30 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          {state.added && !state.error ? (
            <Link href="/cart" className="text-sm font-medium text-maroon-800 underline underline-offset-2">
              Added · View cart
            </Link>
          ) : (
            price && <span className="font-serif text-lg text-maroon-900">{price}</span>
          )}
          <div className="flex-1">
            <StickySubmit />
          </div>
        </div>
      )}
    </form>
  )
}

// Rendered inside the form, so it submits it with the chosen quantity.
function StickySubmit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="w-full rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase disabled:opacity-60">
      {pending ? 'Adding…' : 'Add to cart'}
    </button>
  )
}
