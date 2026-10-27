'use client'

import { useFormStatus } from 'react-dom'

export function Field({
  name,
  label,
  type = 'text',
  autoComplete,
  defaultValue,
  error,
  hint,
  required = true,
}: {
  name: string
  label: string
  type?: string
  autoComplete?: string
  defaultValue?: string
  error?: string
  hint?: string
  required?: boolean
}) {
  const id = `field-${name}`
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-charcoal">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base focus:border-maroon-800 aria-invalid:border-maroon-700"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-maroon-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800 disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  )
}

export function FormAlert({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-sm border border-maroon-700/40 bg-maroon-700/5 px-4 py-3 text-sm text-maroon-800">
        {error}
      </p>
    )
  }
  if (message) {
    return (
      <p role="status" className="rounded-sm border border-gold-500/50 bg-gold-100 px-4 py-3 text-sm text-charcoal">
        {message}
      </p>
    )
  }
  return null
}

export function TextArea({
  name,
  label,
  defaultValue,
  error,
  rows = 5,
}: {
  name: string
  label: string
  defaultValue?: string
  error?: string
  rows?: number
}) {
  const id = `field-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-charcoal">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base focus:border-maroon-800 aria-invalid:border-maroon-700"
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-maroon-700">
          {error}
        </p>
      )}
    </div>
  )
}

/** A field people never see or reach with the keyboard. Only bots fill it in. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  )
}
