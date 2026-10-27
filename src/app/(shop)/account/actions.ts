'use server'

import { siteUrl as siteUrlOf } from '@/lib/site'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  authenticate,
  findActiveUserIdByEmail,
  issueToken,
  normaliseEmail,
  registerUser,
  resetPasswordWithToken,
  safeReturnPath,
  verifyEmailToken,
} from '@/server/auth/accounts'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/server/auth/password'
import { clientIp, endSession, getCurrentUser, startSession } from '@/server/auth/session'
import { sendEmail } from '@/server/email'
import { consumeRateLimit, resetRateLimit } from '@/server/rate-limit'
import { adoptGuestCartFor } from '@/server/shop/cart-session'

export type FormState = {
  error?: string
  fieldErrors?: Record<string, string>
  message?: string
  email?: string
  name?: string
}

const siteUrl = siteUrlOf()
const MINUTE = 60

const email = z.string().trim().max(254).email('Enter a valid email address.')
const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    out[key] ??= issue.message
  }
  return out
}

function tooMany(retryAfterSeconds: number): FormState {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return { error: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }
}

async function sendVerificationEmail(userId: string, to: string) {
  const token = await issueToken(userId, 'EMAIL_VERIFICATION')
  return sendEmail({
    to,
    subject: 'Confirm your email for Divine Mantra',
    text: `Namaste,\n\nPlease confirm your email address by opening this link:\n${siteUrl}/account/verify?token=${token}\n\nThe link works once and expires in 24 hours. If you did not create an account, you can ignore this email.\n\nDivine Mantra`,
  })
}

// ------------------------------------------------------------------ register

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(100),
  email,
  password,
})

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? '') }
  const parsed = registerSchema.safeParse({ ...raw, password: formData.get('password') })
  if (!parsed.success) return { ...raw, fieldErrors: fieldErrors(parsed.error) }

  const ipLimit = await consumeRateLimit(`register:ip:${await clientIp()}`, 5, 60 * MINUTE)
  if (!ipLimit.allowed) return { ...raw, ...tooMany(ipLimit.retryAfterSeconds) }

  const result = await registerUser(parsed.data)
  if (!result.ok) {
    return {
      ...raw,
      fieldErrors: { email: 'An account with this email already exists. Sign in, or use “Forgot password”.' },
    }
  }

  await sendVerificationEmail(result.userId, normaliseEmail(parsed.data.email))
  await startSession(result.userId)
  await adoptGuestCartFor(result.userId)
  redirect('/account?welcome=1')
}

// --------------------------------------------------------------------- login

const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX) })

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: String(formData.get('email') ?? '') }
  const parsed = loginSchema.safeParse({ ...raw, password: formData.get('password') })
  if (!parsed.success) return { ...raw, fieldErrors: fieldErrors(parsed.error) }

  const emailKey = `login:email:${normaliseEmail(parsed.data.email)}`
  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit(`login:ip:${await clientIp()}`, 20, 15 * MINUTE),
    consumeRateLimit(emailKey, 5, 15 * MINUTE),
  ])
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { ...raw, ...tooMany(Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)) }
  }

  const userId = await authenticate(parsed.data.email, parsed.data.password)
  if (!userId) return { ...raw, error: 'That email and password do not match. Please try again.' }

  await resetRateLimit(emailKey)
  await startSession(userId)
  await adoptGuestCartFor(userId)
  redirect(safeReturnPath(formData.get('next')))
}

export async function logout(): Promise<void> {
  await endSession()
  redirect('/')
}

// ----------------------------------------------------------- forgot password

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: String(formData.get('email') ?? '') }
  const parsed = email.safeParse(raw.email)
  if (!parsed.success) return { ...raw, fieldErrors: { email: parsed.error.issues[0].message } }
  const address = normaliseEmail(parsed.data)

  const [ipLimit, emailLimit] = await Promise.all([
    consumeRateLimit(`reset:ip:${await clientIp()}`, 10, 60 * MINUTE),
    consumeRateLimit(`reset:email:${address}`, 3, 60 * MINUTE),
  ])
  if (!ipLimit.allowed) return { ...raw, ...tooMany(ipLimit.retryAfterSeconds) }

  // The reply is the same whether or not the account exists, so this form
  // cannot be used to find out who shops here.
  const done: FormState = {
    message: `If an account exists for ${address}, we have emailed a link to reset the password. It expires in 30 minutes.`,
  }
  if (!emailLimit.allowed) return done

  const userId = await findActiveUserIdByEmail(address)
  if (userId) {
    const token = await issueToken(userId, 'PASSWORD_RESET')
    await sendEmail({
      to: address,
      subject: 'Reset your Divine Mantra password',
      text: `Namaste,\n\nWe received a request to reset your password. Open this link to choose a new one:\n${siteUrl}/account/reset-password?token=${token}\n\nThe link works once and expires in 30 minutes. If you did not ask for this, ignore this email and your password will stay the same.\n\nDivine Mantra`,
    })
  }
  return done
}

// ------------------------------------------------------------ reset password

const resetSchema = z
  .object({ token: z.string().min(10).max(100), password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' })

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error)
    if (errors.token) return { error: 'This reset link is not valid. Please request a new one.' }
    return { fieldErrors: errors }
  }

  const ipLimit = await consumeRateLimit(`reset-submit:ip:${await clientIp()}`, 10, 15 * MINUTE)
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterSeconds)

  const userId = await resetPasswordWithToken(parsed.data.token, parsed.data.password)
  if (!userId) return { error: 'This reset link has expired or was already used. Please request a new one.' }

  await startSession(userId)
  await adoptGuestCartFor(userId)
  redirect('/account?reset=1')
}

// ------------------------------------------------------ resend verification

export async function resendVerification(): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/account/login')
  if (user.emailVerified) return { message: 'Your email is already confirmed.' }

  const limit = await consumeRateLimit(`verify-resend:user:${user.id}`, 3, 60 * MINUTE)
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds)

  const { sent } = await sendVerificationEmail(user.id, user.email)
  return sent
    ? { message: `We sent a new confirmation link to ${user.email}.` }
    : { error: 'We could not send the email just now. Please try again later.' }
}

// -------------------------------------------------------------- verify email

// Confirming takes a button press rather than happening on page load,
// because email security scanners open links automatically and would
// otherwise use up the one-time token before the customer sees it.
export async function confirmEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const ipLimit = await consumeRateLimit(`verify:ip:${await clientIp()}`, 20, 15 * MINUTE)
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterSeconds)

  const ok = await verifyEmailToken(String(formData.get('token') ?? ''))
  if (!ok) return { error: 'This confirmation link has expired or was already used.' }
  return { message: 'Thank you. Your email address is confirmed.' }
}
