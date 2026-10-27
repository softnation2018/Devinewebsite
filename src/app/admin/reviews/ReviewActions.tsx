'use client'

import { useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, moderateReviewAction } from '../actions'

export function ReviewActions({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(moderateReviewAction, {})
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="reviewId" value={id} />
      {status !== 'APPROVED' && (
        <button name="to" value="APPROVED" disabled={pending} className="rounded-sm bg-maroon-900 px-4 py-2 text-ivory disabled:opacity-60">
          Publish
        </button>
      )}
      {status !== 'REJECTED' && (
        <button name="to" value="REJECTED" disabled={pending} className="rounded-sm border border-maroon-900 px-4 py-2 text-maroon-900 disabled:opacity-60">
          Don’t publish
        </button>
      )}
      <FormAlert error={state.error} />
    </form>
  )
}
