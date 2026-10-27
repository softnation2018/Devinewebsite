'use client'

import { useState } from 'react'
import { Price } from '@/components/Price'
import { StockBadge } from '@/components/StockBadge'
import { AddToCartForm } from '../cart/AddToCartForm'

export type VariantOption = { id: string; name: string; pricePaise: number; compareAtPaise: number | null; available: number }

/** Lets the customer choose an option; price, stock and the cart button follow the choice. */
export function VariantPicker({ productId, options, lowStockThreshold, maxLine }: { productId: string; options: VariantOption[]; lowStockThreshold: number; maxLine: number }) {
  const [selectedId, setSelectedId] = useState(() => (options.find((o) => o.available > 0) ?? options[0]).id)
  const selected = options.find((o) => o.id === selectedId) ?? options[0]

  return (
    <div>
      <div className="mt-5">
        <Price pricePaise={selected.pricePaise} compareAtPaise={selected.compareAtPaise} size="lg" />
      </div>
      <div className="mt-2">
        <StockBadge available={selected.available} lowStockThreshold={lowStockThreshold} />
      </div>

      <fieldset className="mt-6">
        <legend className="text-xs tracking-wider text-stone uppercase">Choose an option</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.id}
              className={`cursor-pointer rounded-sm border px-4 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500 ${
                o.id === selected.id ? 'border-maroon-900 bg-maroon-900 text-ivory' : 'border-stone/40 bg-white'
              } ${o.available <= 0 ? 'opacity-60' : ''}`}
            >
              <input type="radio" name="variant-choice" value={o.id} checked={o.id === selected.id} onChange={() => setSelectedId(o.id)} className="sr-only" />
              {o.name}
              {o.available <= 0 && <span className="sr-only"> (out of stock)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {selected.available > 0 ? (
        // Keyed by option, so the quantity resets when the choice changes.
        <AddToCartForm key={selected.id} productId={productId} variantId={selected.id} maxQuantity={Math.min(selected.available, maxLine)} />
      ) : (
        <button
          type="button"
          disabled
          className="mt-8 w-full cursor-not-allowed rounded-sm bg-stone/40 px-6 py-3.5 text-sm font-semibold tracking-[0.14em] text-ivory uppercase sm:w-auto"
        >
          This option is sold out
        </button>
      )}
    </div>
  )
}
