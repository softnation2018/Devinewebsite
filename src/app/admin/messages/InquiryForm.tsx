'use client'

import { startTransition, useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, updateInquiryAction } from '../actions'

export function InquiryForm({ id, status, note, statuses }: { id: string; status: string; note: string; statuses: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateInquiryAction, {})
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}
      className="mt-3 space-y-2"
    >
      <input type="hidden" name="inquiryId" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-stone">
          Status
          <select name="status" defaultValue={status} className="mt-1 block rounded-sm border border-stone/40 bg-white px-2 py-1.5 text-sm text-charcoal">
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 text-xs text-stone">
          Staff note (customers never see this)
          <input name="note" defaultValue={note} maxLength={2000} className="mt-1 block w-full rounded-sm border border-stone/40 bg-white px-2 py-1.5 text-sm text-charcoal" />
        </label>
        <button type="submit" disabled={pending} className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory disabled:opacity-60">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
