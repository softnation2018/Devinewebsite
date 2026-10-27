'use client'

import { startTransition, useActionState, useState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, saveCouponAction } from '../actions'

export type CouponFormValues = {
  id: string | null
  code: string
  description: string
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  percent: string
  amount: string
  minOrder: string
  maxDiscount: string
  usageLimitTotal: string
  usageLimitPerUser: string
  startsAt: string
  endsAt: string
  appliesToCategory: string
  isActive: boolean
}

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'

function Text({ name, label, value, hint, type = 'text', disabled, inputMode }: { name: string; label: string; value: string; hint?: string; type?: string; disabled?: boolean; inputMode?: 'decimal' | 'numeric' }) {
  const id = `c-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={value} readOnly={disabled} inputMode={inputMode} className={`${input} read-only:bg-ivory`} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone">
          {hint}
        </p>
      )}
    </div>
  )
}

export function CouponForm({ values, used, categories }: { values: CouponFormValues; used: number; categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveCouponAction, {})
  const [type, setType] = useState(values.type)
  const locked = used > 0
  const v = values
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}
      className="max-w-2xl space-y-5"
    >
      {v.id && <input type="hidden" name="couponId" value={v.id} />}
      {locked && <p className="rounded-sm bg-ivory px-3 py-2 text-sm">Used {used} times, so the code and discount are fixed. You can still change dates, limits and whether it is active.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="code" label="Code" value={v.code} disabled={locked} hint="What customers type, e.g. DIWALI10." />
        <Text name="description" label="Note for staff (optional)" value={v.description} />
        <div>
          <label htmlFor="c-type" className="block text-sm font-medium">
            Discount type
          </label>
          {locked && <input type="hidden" name="type" value={type} />}
          <select id="c-type" name={locked ? undefined : 'type'} value={type} disabled={locked} onChange={(e) => setType(e.target.value as CouponFormValues['type'])} className={input}>
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </select>
        </div>
        {type === 'PERCENTAGE' && <Text name="percent" label="Percentage off" value={v.percent} disabled={locked} inputMode="decimal" />}
        {type === 'FIXED' && <Text name="amount" label="Amount off (₹)" value={v.amount} disabled={locked} inputMode="decimal" />}
        {type === 'PERCENTAGE' && <Text name="maxDiscount" label="Largest discount (₹, optional)" value={v.maxDiscount} inputMode="decimal" />}
        {type !== 'FREE_SHIPPING' && (
          <div>
            <label htmlFor="c-category" className="block text-sm font-medium">
              Applies to
            </label>
            {locked && <input type="hidden" name="appliesToCategory" value={v.appliesToCategory} />}
            <select id="c-category" name={locked ? undefined : 'appliesToCategory'} defaultValue={v.appliesToCategory} disabled={locked} className={input} aria-describedby="c-category-hint">
              <option value="">The whole order</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  Only {c.name}
                </option>
              ))}
            </select>
            <p id="c-category-hint" className="mt-1 text-xs text-stone">
              With a category, only those items (and its sub-categories) are discounted, and the minimum counts only them.
            </p>
          </div>
        )}
        <Text name="minOrder" label="Minimum order (₹, optional)" value={v.minOrder} inputMode="decimal" />
        <Text name="usageLimitTotal" label="Total uses allowed (optional)" value={v.usageLimitTotal} inputMode="numeric" hint="Empty means no limit." />
        <Text name="usageLimitPerUser" label="Uses per customer" value={v.usageLimitPerUser} inputMode="numeric" />
        <Text name="startsAt" label="Starts (India time, optional)" value={v.startsAt} type="datetime-local" />
        <Text name="endsAt" label="Ends (India time, optional)" value={v.endsAt} type="datetime-local" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive} className="h-4 w-4 accent-maroon-900" />
        Active
      </label>
      <FormAlert error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className="rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800 disabled:opacity-60">
        {pending ? 'Saving…' : v.id ? 'Save changes' : 'Create coupon'}
      </button>
    </form>
  )
}
