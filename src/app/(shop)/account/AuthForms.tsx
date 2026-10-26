'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Field, FormAlert, SubmitButton } from '@/components/forms'
import {
  confirmEmail,
  login,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  type FormState,
} from './actions'

const initial: FormState = {}
const PASSWORD_HINT = 'At least 10 characters. A short phrase is easier to remember than a jumble.'

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, initial)
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert error={state.error} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="text-right text-sm">
        <Link href="/account/forgot-password" className="text-maroon-800 underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  )
}

export function RegisterForm() {
  const [state, action] = useActionState(register, initial)
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert error={state.error} />
      <Field name="name" label="Full name" autoComplete="name" defaultValue={state.name} error={state.fieldErrors?.name} />
      <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial)
  if (state.message) return <FormAlert message={state.message} />
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert error={state.error} />
      <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingText="Sending…">Email me a reset link</SubmitButton>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, initial)
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <Field name="confirm" label="Type it again" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  )
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmail, initial)
  if (state.message) {
    return (
      <div className="space-y-5">
        <FormAlert message={state.message} />
        <Link href="/account" className="block text-center text-sm text-maroon-800 underline underline-offset-2">
          Go to my account
        </Link>
      </div>
    )
  }
  return (
    <form action={action} className="space-y-5">
      <FormAlert error={state.error} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Confirming…">Confirm my email</SubmitButton>
    </form>
  )
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerification, initial)
  return (
    <form action={action} className="mt-3 space-y-3">
      <FormAlert error={state.error} message={state.message} />
      {!state.message && (
        <button type="submit" className="text-sm font-medium text-maroon-800 underline underline-offset-2">
          Send the confirmation email again
        </button>
      )}
    </form>
  )
}
