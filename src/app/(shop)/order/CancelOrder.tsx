'use client'

import { useActionState } from 'react'
import { FormAlert, SubmitButton } from '@/components/forms'
import { cancelOrderAction, type CancelState } from './actions'

export function CancelOrder({ orderNumber, accessKey, paidOnline }: { orderNumber: string; accessKey: string | null; paidOnline: boolean }) {
  const [state, action] = useActionState<CancelState, FormData>(cancelOrderAction, {})
  if (state.done) return null
  return (
    <details className="rounded-sm border border-gold-500/30 bg-white p-6 text-sm">
      <summary className="cursor-pointer font-medium text-maroon-800">Cancel this order</summary>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        {accessKey && <input type="hidden" name="key" value={accessKey} />}
        <FormAlert error={state.error} />
        <label className="block font-medium">
          Reason (optional)
          <input name="reason" maxLength={300} className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base" />
        </label>
        <p className="text-stone">
          This cannot be undone.
          {paidOnline && ' As you paid online, a refund to your original payment method will be due. It appears on this page once it has been issued.'}
        </p>
        <SubmitButton pendingText="Cancelling…">Yes, cancel my order</SubmitButton>
      </form>
    </details>
  )
}
