'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Field, FormAlert, Honeypot, SubmitButton, TextArea } from '@/components/forms'
import { confirmNewsletter, sendContactMessage, subscribeNewsletter, unsubscribeNewsletter, type PublicFormState } from './actions'

const initial: PublicFormState = {}

export function ContactForm({ defaultName, defaultEmail }: { defaultName?: string; defaultEmail?: string }) {
  const [state, action] = useActionState(sendContactMessage, initial)
  if (state.message) return <FormAlert message={state.message} />
  const v = state.values ?? {}
  const e = state.fieldErrors ?? {}
  return (
    <form action={action} className="relative space-y-5" noValidate>
      <FormAlert error={state.error} />
      <Honeypot />
      <Field name="name" label="Your name" autoComplete="name" defaultValue={v.name ?? defaultName} error={e.name} />
      <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={v.email ?? defaultEmail} error={e.email} />
      <Field name="phone" label="Phone (optional)" type="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} required={false} />
      <Field name="orderNumber" label="Order number (optional)" defaultValue={v.orderNumber} error={e.orderNumber} required={false} />
      <Field name="subject" label="Subject" defaultValue={v.subject} error={e.subject} />
      <TextArea name="message" label="Message" defaultValue={v.message} error={e.message} />
      <SubmitButton pendingText="Sending…">Send message</SubmitButton>
    </form>
  )
}

export function NewsletterForm() {
  const [state, action] = useActionState(subscribeNewsletter, initial)
  if (state.message) return <p role="status" className="mt-3 text-sm text-gold-300">{state.message}</p>
  const error = state.error ?? state.fieldErrors?.email
  return (
    <form action={action} className="relative mt-3" noValidate>
      <Honeypot />
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Your email"
          defaultValue={state.values?.email}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'newsletter-error' : undefined}
          className="min-w-0 flex-1 rounded-sm border border-gold-500/40 bg-maroon-900 px-3 py-2 text-sm text-ivory placeholder:text-ivory/50"
        />
        <NewsletterButton />
      </div>
      {error && (
        <p id="newsletter-error" role="alert" className="mt-2 text-sm text-gold-300">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-ivory/60">We email a link to confirm first. Unsubscribe any time.</p>
    </form>
  )
}

function NewsletterButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded-sm bg-gold-500 px-4 py-2 text-sm text-maroon-950 hover:bg-gold-300 disabled:opacity-60">
      {pending ? 'Sending…' : 'Sign up'}
    </button>
  )
}

export function TokenForm({ token, kind }: { token: string; kind: 'confirm' | 'unsubscribe' }) {
  const [state, action] = useActionState(kind === 'confirm' ? confirmNewsletter : unsubscribeNewsletter, initial)
  if (state.message || state.error) return <FormAlert message={state.message} error={state.error} />
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Please wait…">{kind === 'confirm' ? 'Confirm my sign-up' : 'Unsubscribe me'}</SubmitButton>
    </form>
  )
}
