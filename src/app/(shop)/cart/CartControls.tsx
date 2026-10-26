'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { applyCouponAction, type CartActionState, removeCouponAction, updateLineAction } from './actions'

export function LineQuantity({ itemId, quantity, max, name }: { itemId: string; quantity: number; max: number; name: string }) {
  const options = Math.max(max, quantity)
  return (
    <div className="flex items-center gap-3">
      <form action={updateLineAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <label htmlFor={`qty-${itemId}`} className="sr-only">
          Quantity of {name}
        </label>
        <select
          id={`qty-${itemId}`}
          name="quantity"
          defaultValue={String(quantity)}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="rounded-sm border border-stone/40 bg-white px-2 py-1.5 text-sm"
        >
          {Array.from({ length: options }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="ml-2 text-xs underline">
            Update
          </button>
        </noscript>
      </form>
      <form action={updateLineAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value="0" />
        <button type="submit" className="text-xs text-stone underline underline-offset-2 hover:text-maroon-800">
          Remove<span className="sr-only"> {name}</span>
        </button>
      </form>
    </div>
  )
}

export function CouponForm({ appliedCode, problem }: { appliedCode: string | null; problem: string | null }) {
  const [state, action] = useActionState<CartActionState, FormData>(applyCouponAction, {})
  if (appliedCode) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>
            Code <strong>{appliedCode}</strong>
          </span>
          <form action={removeCouponAction}>
            <button type="submit" className="text-xs text-stone underline underline-offset-2">
              Remove
            </button>
          </form>
        </div>
        {problem && <FormAlert error={problem} />}
      </div>
    )
  }
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="coupon" className="block text-sm font-medium">
        Discount code
      </label>
      <div className="flex">
        <input
          id="coupon"
          name="code"
          maxLength={40}
          autoComplete="off"
          className="w-full rounded-l-sm border border-stone/40 bg-white px-3 py-2 text-sm uppercase"
        />
        <button type="submit" className="rounded-r-sm border border-l-0 border-maroon-900 bg-maroon-900 px-4 text-sm text-ivory">
          Apply
        </button>
      </div>
      <FormAlert error={state.error} />
    </form>
  )
}
