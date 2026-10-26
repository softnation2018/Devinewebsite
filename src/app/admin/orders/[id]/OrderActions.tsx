'use client'

import { useActionState } from 'react'
import { FormAlert, SubmitButton } from '@/components/forms'
import { type AdminState, cancelOrderAction, saveAdminNoteAction, setOrderStatusAction } from '../../actions'

export function StatusButton({ orderId, to, label }: { orderId: string; to: 'CONFIRMED' | 'PROCESSING'; label: string }) {
  const [state, action] = useActionState<AdminState, FormData>(setOrderStatusAction, {})
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton pendingText="Saving…">{label}</SubmitButton>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}

export function CancelForm({ orderId, paid }: { orderId: string; paid: boolean }) {
  const [state, action] = useActionState<AdminState, FormData>(cancelOrderAction, {})
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="reason" className="block text-sm font-medium">
        Cancel this order
      </label>
      <input id="reason" name="reason" required maxLength={300} placeholder="Reason (kept in the order history)" className="w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
      {paid && <p className="text-xs text-maroon-800">This order is paid. Cancelling does not refund it; the refund must be issued separately.</p>}
      <button type="submit" className="rounded-sm border border-maroon-800 px-4 py-2 text-sm text-maroon-800 hover:bg-maroon-800 hover:text-ivory">
        Cancel order and release stock
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}

export function NoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [state, action] = useActionState<AdminState, FormData>(saveAdminNoteAction, {})
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="note" className="block text-sm font-medium">
        Staff note (not shown to the customer)
      </label>
      <textarea id="note" name="note" defaultValue={note ?? ''} rows={3} maxLength={2000} className="w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
      <button type="submit" className="rounded-sm border border-stone/50 px-4 py-2 text-sm">
        Save note
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
