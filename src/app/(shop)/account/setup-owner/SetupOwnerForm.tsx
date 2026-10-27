'use client'

import { useActionState } from 'react'
import { Field, FormAlert, SubmitButton } from '@/components/forms'
import { type SetupState, setupOwner } from './actions'

export function SetupOwnerForm({ token }: { token: string }) {
  const [state, action] = useActionState<SetupState, FormData>(setupOwner, {})
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field name="name" label="Your name" autoComplete="name" defaultValue={state.name} required={false} />
      <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} hint="You sign in to the admin with this email." />
      <Field name="password" label="Choose a password" type="password" autoComplete="new-password" hint="At least 10 characters. Keep it to yourself." />
      <Field name="confirm" label="Type the password again" type="password" autoComplete="new-password" />
      <SubmitButton pendingText="Setting up…">Create owner account</SubmitButton>
    </form>
  )
}
