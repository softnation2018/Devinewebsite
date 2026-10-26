'use client'

import { useActionState } from 'react'
import { type AdminState, saveSettingAction } from '../actions'

export type SettingView = {
  key: string
  description: string | null
  needsOwnerDecision: boolean
  kind: 'money' | 'moneyOrNone' | 'boolean' | 'days' | 'choice' | 'text'
  current: string
  checked: boolean
  options?: { value: string; label: string }[]
  hint?: string
}

export function SettingForm({ s }: { s: SettingView }) {
  const [state, action] = useActionState<AdminState, FormData>(saveSettingAction, {})
  const id = `setting-${s.key.replace('.', '-')}`
  const input = 'w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'
  return (
    <form action={action} className="grid gap-2 py-4 sm:grid-cols-[16rem_1fr_auto] sm:items-start">
      <input type="hidden" name="key" value={s.key} />
      <div>
        <label htmlFor={id} className="block text-sm font-medium">
          {s.description ?? s.key}
        </label>
        {s.needsOwnerDecision && <span className="mt-1 inline-block rounded-sm bg-gold-300/50 px-1.5 text-xs">Placeholder: needs your decision</span>}
      </div>
      <div>
        {s.kind === 'boolean' ? (
          <label className="flex items-center gap-2 text-sm">
            <input id={id} type="checkbox" name="value" defaultChecked={s.checked} className="h-4 w-4 accent-maroon-900" />
            Yes
          </label>
        ) : s.kind === 'choice' ? (
          <select id={id} name="value" defaultValue={s.current} className={input}>
            {s.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : s.key === 'business.address' ? (
          <textarea id={id} name="value" defaultValue={s.current} rows={3} className={input} />
        ) : (
          <div className="flex items-center gap-2">
            {(s.kind === 'money' || s.kind === 'moneyOrNone') && <span className="text-sm text-stone">₹</span>}
            <input id={id} name="value" defaultValue={s.current} inputMode={s.kind === 'text' ? undefined : 'decimal'} className={input} />
            {s.kind === 'days' && <span className="text-sm text-stone">days</span>}
          </div>
        )}
        {s.hint && <p className="mt-1 text-xs text-stone">{s.hint}</p>}
        {state.error && <p className="mt-1 text-sm text-maroon-700">{state.error}</p>}
        {state.message && <p className="mt-1 text-sm text-emerald-800">{state.message}</p>}
      </div>
      <button type="submit" className="rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory">
        Save
      </button>
    </form>
  )
}
