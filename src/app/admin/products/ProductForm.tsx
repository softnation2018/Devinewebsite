'use client'

import { startTransition, useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, adjustStockAction, saveProductAction } from '../actions'

export type ProductFormValues = {
  id: string | null
  name: string
  nameHi: string
  slug: string
  sku: string
  categoryId: string
  shortDescription: string
  description: string
  price: string
  compareAt: string
  costPrice: string
  gstRateBp: number
  hsnCode: string
  weightGrams: string
  lowStockThreshold: string
  material: string
  shippingNote: string
  authenticityNote: string
  seoTitle: string
  seoDescription: string
  returnEligible: boolean
  isFeatured: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'

function Text({ name, label, value, hint, required, area, inputMode, maxLength }: { name: string; label: string; value: string; hint?: string; required?: boolean; area?: number; inputMode?: 'decimal' | 'numeric'; maxLength?: number }) {
  const id = `p-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {area ? (
        <textarea id={id} name={name} defaultValue={value} rows={area} maxLength={maxLength} className={input} aria-describedby={hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} name={name} defaultValue={value} required={required} inputMode={inputMode} maxLength={maxLength} className={input} aria-describedby={hint ? `${id}-hint` : undefined} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone">
          {hint}
        </p>
      )}
    </div>
  )
}

export function ProductForm({
  values,
  categories,
  gstRates,
  showCost,
  isDemo,
}: {
  values: ProductFormValues
  categories: { id: string; name: string }[]
  gstRates: readonly number[]
  showCost: boolean
  isDemo: boolean
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveProductAction, {})
  const v = values
  return (
    // Submitted by hand rather than through the action prop, so a rejected
    // save keeps everything typed instead of resetting the form.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}
      className="space-y-8"
    >
      {v.id && <input type="hidden" name="productId" value={v.id} />}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-xl text-maroon-900">Basics</legend>
        <Text name="name" label="Name" value={v.name} required maxLength={160} />
        <Text name="nameHi" label="Name in Hindi (optional)" value={v.nameHi} maxLength={160} />
        <Text name="sku" label="SKU" value={v.sku} required hint="Your own stock code, e.g. RUD-5M-8MM." maxLength={40} />
        <Text name="slug" label="Web address (optional)" value={v.slug} hint="Made from the name if left empty." maxLength={80} />
        <div>
          <label htmlFor="p-categoryId" className="block text-sm font-medium">
            Category
          </label>
          <select id="p-categoryId" name="categoryId" defaultValue={v.categoryId} className={input}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Text name="material" label="Material (optional)" value={v.material} maxLength={200} />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 font-serif text-xl text-maroon-900">Description</legend>
        <Text name="shortDescription" label="Short description" value={v.shortDescription} area={2} maxLength={300} hint="Shown on product cards. Up to 300 characters." />
        <Text name="description" label="Full description" value={v.description} area={8} maxLength={10000} hint="Describe what it is and its traditional significance. Do not promise results such as wealth, marriage, healing or protection." />
        <Text name="authenticityNote" label="Authenticity or sourcing note (optional)" value={v.authenticityNote} area={2} maxLength={1000} hint="Only state what you can prove with documents, such as a lab report you hold." />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-serif text-xl text-maroon-900">Price and tax</legend>
        <Text name="price" label="Price (₹, GST included)" value={v.price} required inputMode="decimal" />
        <Text name="compareAt" label="Compare-at price (optional)" value={v.compareAt} inputMode="decimal" hint="A genuine earlier price only; shown struck through." />
        {showCost && <Text name="costPrice" label="Your cost (₹, staff only)" value={v.costPrice} inputMode="decimal" />}
        <div>
          <label htmlFor="p-gstRateBp" className="block text-sm font-medium">
            GST rate
          </label>
          <select id="p-gstRateBp" name="gstRateBp" defaultValue={String(v.gstRateBp)} className={input}>
            {gstRates.map((r) => (
              <option key={r} value={r}>
                {r / 100}%
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone">Confirm the right rate with your accountant.</p>
        </div>
        <Text name="hsnCode" label="HSN code (optional)" value={v.hsnCode} inputMode="numeric" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-serif text-xl text-maroon-900">Shipping and stock</legend>
        <Text name="weightGrams" label="Packed weight (grams)" value={v.weightGrams} required inputMode="numeric" />
        <Text name="lowStockThreshold" label="Low-stock alert at" value={v.lowStockThreshold} required inputMode="numeric" />
        <Text name="shippingNote" label="Shipping note (optional)" value={v.shippingNote} maxLength={300} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="returnEligible" defaultChecked={v.returnEligible} className="h-4 w-4 accent-maroon-900" />
          Can be returned
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-xl text-maroon-900">Search engines (optional)</legend>
        <Text name="seoTitle" label="Page title" value={v.seoTitle} maxLength={70} />
        <Text name="seoDescription" label="Page description" value={v.seoDescription} maxLength={160} />
      </fieldset>

      <fieldset className="space-y-3 rounded-sm border border-gold-500/40 bg-ivory p-4">
        <legend className="px-1 font-serif text-xl text-maroon-900">Visibility</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['DRAFT', 'Draft (hidden)'],
              ['PUBLISHED', 'On sale'],
              ['ARCHIVED', 'Archived (hidden, kept for past orders)'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="status" value={value} defaultChecked={v.status === value} disabled={isDemo && value === 'PUBLISHED' && v.status !== 'PUBLISHED'} className="accent-maroon-900" />
              {label}
            </label>
          ))}
        </div>
        {isDemo && <p className="text-xs text-maroon-800">This is demo content. It cannot be put on sale.</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isFeatured" defaultChecked={v.isFeatured} className="h-4 w-4 accent-maroon-900" />
          Feature on the home page
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="claimsConfirmed" className="mt-0.5 h-4 w-4 accent-maroon-900" />
          <span>I hold documents for any authenticity, origin or certification claim in this text (needed only when such a claim is present).</span>
        </label>
      </fieldset>

      <div className="space-y-3">
        <FormAlert error={state.error} message={state.message} />
        <button type="submit" disabled={pending} className="rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800 disabled:opacity-60">
          {pending ? 'Saving…' : v.id ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  )
}

export function StockForm({ productId, variantId, reasons }: { productId?: string; variantId?: string; reasons: Record<string, string> }) {
  const [state, action] = useActionState<AdminState, FormData>(adjustStockAction, {})
  // Several stock forms can share a page (one per option), so ids must differ.
  const p = `s-${variantId ?? productId}`
  return (
    <form action={action} className="space-y-3">
      {variantId ? <input type="hidden" name="variantId" value={variantId} /> : <input type="hidden" name="productId" value={productId} />}
      <div>
        <label htmlFor={`${p}-reason`} className="block text-sm font-medium">
          What happened
        </label>
        <select id={`${p}-reason`} name="reason" className={input}>
          {Object.entries(reasons).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${p}-delta`} className="block text-sm font-medium">
          Change in quantity
        </label>
        <input id={`${p}-delta`} name="delta" required inputMode="numeric" placeholder="e.g. 10 or -2" className={input} />
      </div>
      <div>
        <label htmlFor={`${p}-note`} className="block text-sm font-medium">
          Note
        </label>
        <input id={`${p}-note`} name="note" maxLength={300} placeholder="Supplier bill no., count date…" className={input} />
      </div>
      <button type="submit" className="rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory">
        Update stock
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
