'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, refundAction, resolveRefundAction } from '../../actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'
const button = 'rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory disabled:opacity-50'

export function RefundForm({ orderId, online, maxRupees }: { orderId: string; online: boolean; maxRupees: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(refundAction, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const amount = new FormData(e.currentTarget).get('amount')
        if (!confirm(`Refund ₹${amount}${online ? ' through Razorpay' : ''}? This cannot be undone.`)) e.preventDefault()
      }}
      className="space-y-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="kind" value={online ? 'razorpay' : 'manual'} />
      <label className="block text-sm font-medium">
        Amount (₹)
        <input name="amount" defaultValue={maxRupees} inputMode="decimal" required className={input} />
      </label>
      {!online && (
        <>
          <p className="text-xs text-stone">Send the money yourself first, then record it here with the transfer’s reference number.</p>
          <label className="block text-sm font-medium">
            Sent by
            <select name="method" className={input}>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            UTR / reference number
            <input name="reference" required maxLength={40} className={input} />
          </label>
        </>
      )}
      <label className="block text-sm font-medium">
        Reason
        <input name="reason" required maxLength={300} className={input} />
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? 'Working…' : online ? 'Refund through Razorpay' : 'Record refund'}
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}

export function ResolveRefundForm({ refundId }: { refundId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(resolveRefundAction, {})
  return (
    <form action={action} className="mt-2 space-y-2 rounded-sm bg-gold-100 p-3">
      <p className="text-xs">Waiting for Razorpay. If it does not update, check the payment in your Razorpay dashboard and record what you find.</p>
      <input type="hidden" name="refundId" value={refundId} />
      <label className="block text-xs">
        Razorpay refund id (if a refund exists)
        <input name="providerRefundId" placeholder="rfnd_…" maxLength={40} className={input} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button name="outcome" value="COMPLETED" disabled={pending} className={button}>
          Refund exists
        </button>
        <button name="outcome" value="FAILED" disabled={pending} className={button}>
          No refund was made
        </button>
      </div>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
