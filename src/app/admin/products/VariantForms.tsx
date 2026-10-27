'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, saveVariantAction } from '../actions'

export type VariantFormValues = { id: string | null; name: string; sku: string; price: string; compareAt: string; weight: string; isActive: boolean }

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'

/** Adds one option to a product, or edits an existing one. */
export function VariantForm({ productId, values, productPrice }: { productId: string; values: VariantFormValues; productPrice: string }) {
  const [state, action] = useActionState<AdminState, FormData>(saveVariantAction, {})
  const p = `v-${values.id ?? 'new'}`
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      {values.id && <input type="hidden" name="variantId" value={values.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-name`} className="block text-sm font-medium">
            Option name
          </label>
          <input id={`${p}-name`} name="name" required maxLength={80} defaultValue={values.name} placeholder="e.g. 5 Mukhi, 8 mm" className={input} />
        </div>
        <div>
          <label htmlFor={`${p}-sku`} className="block text-sm font-medium">
            SKU
          </label>
          <input id={`${p}-sku`} name="sku" required maxLength={40} defaultValue={values.sku} className={`${input} uppercase`} />
        </div>
        <div>
          <label htmlFor={`${p}-price`} className="block text-sm font-medium">
            Price (₹)
          </label>
          <input id={`${p}-price`} name="price" inputMode="decimal" defaultValue={values.price} placeholder={productPrice} className={input} />
          <p className="mt-1 text-xs text-stone">Leave empty to use the product price.</p>
        </div>
        <div>
          <label htmlFor={`${p}-compareAt`} className="block text-sm font-medium">
            Compare-at price (₹)
          </label>
          <input id={`${p}-compareAt`} name="compareAt" inputMode="decimal" defaultValue={values.compareAt} className={input} />
        </div>
        <div>
          <label htmlFor={`${p}-weight`} className="block text-sm font-medium">
            Weight (grams)
          </label>
          <input id={`${p}-weight`} name="weight" inputMode="numeric" defaultValue={values.weight} className={input} />
          <p className="mt-1 text-xs text-stone">Leave empty to use the product weight.</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive} />
          On sale
        </label>
      </div>
      <button type="submit" className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory hover:bg-maroon-800">
        {values.id ? 'Save option' : 'Add option'}
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
