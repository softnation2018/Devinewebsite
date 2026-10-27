'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, returnAction } from '../../actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'
const button = 'rounded-sm border border-maroon-900 px-3 py-1.5 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory disabled:opacity-50'

export function ReturnActions({ returnId, status }: { returnId: string; status: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(returnAction, {})
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="returnId" value={returnId} />
      {status === 'REQUESTED' && (
        <>
          <label className="block text-xs">
            Note (if declining, this is shown to the customer)
            <input name="note" maxLength={1000} className={input} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button name="move" value="APPROVE" disabled={pending} className={button}>
              Approve
            </button>
            <button name="move" value="REJECT" disabled={pending} className={button}>
              Decline
            </button>
          </div>
        </>
      )}
      {status === 'APPROVED' && (
        <>
          <label className="block text-xs">
            Return parcel tracking (AWB) number
            <input name="awbNumber" maxLength={60} className={input} />
          </label>
          <button name="move" value="PICKUP" disabled={pending} className={button}>
            Pickup arranged
          </button>
        </>
      )}
      {['APPROVED', 'PICKUP_SCHEDULED', 'IN_TRANSIT'].includes(status) && (
        <div className="space-y-2 border-t border-gold-500/20 pt-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="restock" className="h-4 w-4 accent-maroon-900" />
            Put the items back into stock (only if they can be sold again)
          </label>
          <button name="move" value="RECEIVE" disabled={pending} className={button}>
            Parcel received back
          </button>
        </div>
      )}
      {status === 'RECEIVED' && (
        <>
          <p className="text-xs text-stone">Issue any refund in the Refunds box, then close the return.</p>
          <button name="move" value="CLOSE" disabled={pending} className={button}>
            Close return
          </button>
        </>
      )}
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
