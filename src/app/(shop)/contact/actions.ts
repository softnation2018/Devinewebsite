'use server'

import { z } from 'zod'
import { clientIp, getCurrentUser } from '@/server/auth/session'
import { contactSchema, createInquiry } from '@/server/contact'
import { confirmSubscription, requestSubscription, unsubscribe } from '@/server/newsletter'
import { newsletterAvailable } from '@/server/newsletter-token'
import { consumeRateLimit } from '@/server/rate-limit'

export type PublicFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  message?: string
  values?: Record<string, string>
}

const HOUR = 60 * 60

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) out[String(issue.path[0] ?? 'form')] ??= issue.message
  return out
}

function tooMany(): PublicFormState {
  return { error: 'Too many attempts from your connection. Please try again in an hour.' }
}

export async function sendContactMessage(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const values = Object.fromEntries(
    ['name', 'email', 'phone', 'orderNumber', 'subject', 'message'].map((k) => [k, String(formData.get(k) ?? '')]),
  )
  // A hidden field people never see. Bots that fill every box are told "sent" and dropped.
  if (String(formData.get('website') ?? '') !== '') return { message: 'Thank you. Your message has been received.' }

  const parsed = contactSchema.safeParse(values)
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error) }

  const limit = await consumeRateLimit(`contact:ip:${await clientIp()}`, 5, HOUR)
  if (!limit.allowed) return { values, ...tooMany() }

  const user = await getCurrentUser()
  await createInquiry(parsed.data, user?.id ?? null)
  return { message: 'Thank you. Your message has been received and we will reply by email.' }
}

const newsletterEmail = z.string().trim().max(254).email('Enter a valid email address.')

export async function subscribeNewsletter(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  if (!newsletterAvailable()) return { error: 'Newsletter sign-up is not open yet.' }
  const raw = String(formData.get('email') ?? '')
  if (String(formData.get('website') ?? '') !== '') return { message: 'Please check your inbox to confirm.' }
  const parsed = newsletterEmail.safeParse(raw)
  if (!parsed.success) return { values: { email: raw }, fieldErrors: { email: parsed.error.issues[0].message } }

  const [ip, perEmail] = await Promise.all([
    consumeRateLimit(`newsletter:ip:${await clientIp()}`, 5, HOUR),
    consumeRateLimit(`newsletter:email:${parsed.data.toLowerCase()}`, 3, 24 * HOUR),
  ])
  if (!ip.allowed) return { values: { email: raw }, ...tooMany() }
  // Past the per-address limit we quietly send nothing, but say the same thing.
  if (perEmail.allowed) await requestSubscription(parsed.data, 'footer')
  return { message: 'Please check your inbox and open the link to confirm your sign-up.' }
}

export async function confirmNewsletter(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  if (!newsletterAvailable()) return { error: 'This link cannot be checked right now. Please try again later.' }
  const ok = await confirmSubscription(String(formData.get('token') ?? ''))
  return ok
    ? { message: 'Thank you. Your newsletter sign-up is confirmed.' }
    : { error: 'This link is not valid or has expired. Please sign up again from the bottom of any page.' }
}

export async function unsubscribeNewsletter(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  if (!newsletterAvailable()) return { error: 'This link cannot be checked right now. Please try again later.' }
  const ok = await unsubscribe(String(formData.get('token') ?? ''))
  return ok ? { message: 'You have been unsubscribed. You will not get newsletter emails from us.' } : { error: 'This unsubscribe link is not valid.' }
}
