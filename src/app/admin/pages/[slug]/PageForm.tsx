'use client'

import { startTransition, useActionState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, savePageAction } from '../../actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'

export function PageForm({ page }: { page: { slug: string; title: string; bodyMarkdown: string; seoTitle: string; seoDescription: string; isPublished: boolean } }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(savePageAction, {})
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => action(data))
      }}
      className="space-y-4"
    >
      <input type="hidden" name="slug" value={page.slug} />
      <label className="block text-sm font-medium">
        Title
        <input name="title" defaultValue={page.title} required maxLength={120} className={input} />
      </label>
      <label className="block text-sm font-medium">
        Text
        <textarea name="bodyMarkdown" defaultValue={page.bodyMarkdown} rows={18} className={`${input} font-mono`} />
      </label>
      <p className="text-xs text-stone">
        Formatting: start a line with ## for a heading, - for a bullet, 1. for a numbered list. **bold**, *italic*, [link text](https://…). Leave an empty line between paragraphs.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Search engine title (optional)
          <input name="seoTitle" defaultValue={page.seoTitle} maxLength={70} className={input} />
        </label>
        <label className="block text-sm font-medium">
          Search engine description (optional)
          <input name="seoDescription" defaultValue={page.seoDescription} maxLength={160} className={input} />
        </label>
      </div>
      <fieldset className="space-y-2 rounded-sm border border-gold-500/40 bg-ivory p-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="publish" defaultChecked={page.isPublished} className="h-4 w-4 accent-maroon-900" />
          Published (shown in the shop and footer)
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="reviewed" className="mt-0.5 h-4 w-4 accent-maroon-900" />
          <span>This text is my business’s own policy and has been reviewed (needed to publish).</span>
        </label>
      </fieldset>
      <FormAlert error={state.error} message={state.message} />
      <button type="submit" disabled={pending} className="rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase disabled:opacity-60">
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
