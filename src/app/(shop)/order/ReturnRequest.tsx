'use client'

import { useActionState } from 'react'
import { FormAlert, SubmitButton } from '@/components/forms'
import { requestReturnAction, type ReturnState } from './actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base'

export function ReturnRequest({
  orderNumber,
  accessKey,
  items,
  reasons,
}: {
  orderNumber: string
  accessKey: string | null
  items: { id: string; name: string; maxQuantity: number }[]
  reasons: { value: string; label: string }[]
}) {
  const [state, action] = useActionState<ReturnState, FormData>(requestReturnAction, {})
  if (state.done) return <FormAlert message="Your return request has been sent. We will reply by email, and you can follow it on this page." />
  return (
    <details className="rounded-sm border border-gold-500/30 bg-white p-6 text-sm">
      <summary className="cursor-pointer font-medium text-maroon-800">Request a return</summary>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        {accessKey && <input type="hidden" name="key" value={accessKey} />}
        <FormAlert error={state.error} />
        <fieldset className="space-y-2">
          <legend className="font-medium">What would you like to return?</legend>
          {items.map((i) => (
            <label key={i.id} className="flex items-center justify-between gap-3">
              <span>{i.name}</span>
              <select name={`qty:${i.id}`} defaultValue={items.length === 1 ? String(i.maxQuantity) : '0'} className="rounded-sm border border-stone/40 bg-white px-2 py-1.5" aria-label={`Quantity of ${i.name} to return`}>
                {Array.from({ length: i.maxQuantity + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
        <label className="block font-medium">
          Reason
          <select name="reason" required defaultValue="" className={input}>
            <option value="" disabled>
              Choose…
            </option>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-medium">
          Anything we should know? (optional)
          <textarea name="note" rows={3} maxLength={1000} className={input} />
        </label>
        <p className="text-stone">We will check your request against our return policy and reply by email. Please keep the item and its packaging until then.</p>
        <SubmitButton pendingText="Sending…">Send return request</SubmitButton>
      </form>
    </details>
  )
}
