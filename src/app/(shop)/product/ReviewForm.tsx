'use client'

import { useActionState } from 'react'
import { FormAlert, SubmitButton } from '@/components/forms'
import { type ReviewFormState, submitReviewAction } from './actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base focus:border-maroon-800'

export function ReviewForm({ productId, existing }: { productId: string; existing: { rating: number; title: string | null; body: string | null } | null }) {
  const [state, action] = useActionState<ReviewFormState, FormData>(submitReviewAction, {})
  if (state.message) return <FormAlert message={state.message} />
  const e = state.fieldErrors ?? {}
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="productId" value={productId} />
      <fieldset aria-describedby={e.rating ? 'rating-error' : undefined}>
        <legend className="text-sm font-medium">Your rating</legend>
        <div className="mt-1 flex flex-row-reverse justify-end gap-1 [&>label:has(:checked)~label]:text-gold-500">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="cursor-pointer rounded-sm px-0.5 text-3xl text-stone/40 has-checked:text-gold-500 has-focus-visible:outline-2 has-focus-visible:outline-maroon-800">
              <input type="radio" name="rating" value={n} defaultChecked={existing?.rating === n} className="sr-only" />
              <span aria-hidden="true">★</span>
              <span className="sr-only">
                {n} star{n === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
        {e.rating && (
          <p id="rating-error" className="mt-1 text-sm text-maroon-700">
            {e.rating}
          </p>
        )}
      </fieldset>
      <label className="block text-sm font-medium">
        Title (optional)
        <input name="title" maxLength={100} defaultValue={existing?.title ?? ''} className={input} />
      </label>
      {e.title && <p className="text-sm text-maroon-700">{e.title}</p>}
      <label className="block text-sm font-medium">
        Your review (optional)
        <textarea name="body" rows={4} maxLength={2000} defaultValue={existing?.body ?? ''} className={input} />
      </label>
      {e.body && <p className="text-sm text-maroon-700">{e.body}</p>}
      <p className="text-xs text-stone">Reviews are checked before they appear. Only your first name is shown.</p>
      <SubmitButton pendingText="Sending…">{existing ? 'Update review' : 'Submit review'}</SubmitButton>
    </form>
  )
}
