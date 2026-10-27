'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { clientIp } from '@/server/auth/session'
import { confirmCheckoutPayment, startOnlinePayment } from '@/server/payments/online'
import { razorpay } from '@/server/payments/razorpay'
import { consumeRateLimit } from '@/server/rate-limit'
import { getCancellationRule, getReturnWindowDays, onlinePaymentAvailable } from '@/server/settings'
import { requestReturn, RETURN_REASONS, type ReturnReason } from '@/server/returns'
import { cancelOwnOrder } from '@/server/shop/cancel'
import { loadViewableOrder } from './viewer'

export type StartPaymentResult =
  | { ok: true; keyId: string; providerOrderId: string; amountPaise: number; prefill: { name: string; email: string; contact: string } }
  | { ok: false; error: string }

const ref = z.object({ orderNumber: z.string().min(5).max(40), key: z.string().max(100).nullable() })

export async function startPaymentAction(orderNumber: string, key: string | null): Promise<StartPaymentResult> {
  const parsed = ref.safeParse({ orderNumber, key })
  if (!parsed.success || !onlinePaymentAvailable()) return { ok: false, error: 'Online payment is not available.' }
  const limit = await consumeRateLimit(`pay:ip:${await clientIp()}`, 20, 10 * 60)
  if (!limit.allowed) return { ok: false, error: 'Too many attempts. Please wait a few minutes.' }

  const found = await loadViewableOrder(parsed.data.orderNumber, parsed.data.key)
  if (!found) return { ok: false, error: 'We could not find that order.' }
  const started = await startOnlinePayment(found.order.id, razorpay)
  if (!started.ok) return { ok: false, error: 'This order cannot be paid online now.' }

  const address = found.order.shippingAddress as Record<string, string | null>
  return {
    ok: true,
    keyId: process.env.RAZORPAY_KEY_ID!,
    providerOrderId: started.providerOrderId,
    amountPaise: started.amountPaise,
    prefill: {
      name: address.fullName ?? '',
      email: found.order.guestEmail ?? found.user?.email ?? '',
      contact: address.phone ? `+91${address.phone}` : '',
    },
  }
}

const callback = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
})

export async function confirmPaymentAction(
  orderNumber: string,
  key: string | null,
  response: unknown,
): Promise<{ state: 'PAID' | 'PENDING' | 'FAILED' | 'ERROR' }> {
  const parsedRef = ref.safeParse({ orderNumber, key })
  const cb = callback.safeParse(response)
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!parsedRef.success || !cb.success || !secret) return { state: 'ERROR' }

  const found = await loadViewableOrder(parsedRef.data.orderNumber, parsedRef.data.key)
  if (!found) return { state: 'ERROR' }
  const state = await confirmCheckoutPayment(found.order.id, cb.data, razorpay, secret)
  refresh()
  if (state === 'PAID' || state === 'PENDING' || state === 'FAILED') return { state }
  return { state: 'ERROR' }
}

export type CancelState = { error?: string; done?: boolean }

export async function cancelOrderAction(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const parsed = ref.safeParse({ orderNumber: String(formData.get('orderNumber') ?? ''), key: (formData.get('key') as string | null) || null })
  if (!parsed.success) return { error: 'Invalid request.' }
  const limit = await consumeRateLimit(`cancel:ip:${await clientIp()}`, 10, 60 * 60)
  if (!limit.allowed) return { error: 'Too many attempts. Please try again later.' }
  const found = await loadViewableOrder(parsed.data.orderNumber, parsed.data.key)
  if (!found) return { error: 'We could not find that order.' }
  const r = await cancelOwnOrder(found.order.id, await getCancellationRule(), String(formData.get('reason') ?? ''), {
    userId: found.user?.id ?? null,
    ip: await clientIp(),
  })
  if (!r.ok) return { error: r.error }
  refresh()
  return { done: true }
}

export type ReturnState = { error?: string; done?: boolean }

export async function requestReturnAction(_prev: ReturnState, formData: FormData): Promise<ReturnState> {
  const parsed = ref.safeParse({ orderNumber: String(formData.get('orderNumber') ?? ''), key: (formData.get('key') as string | null) || null })
  const reason = String(formData.get('reason') ?? '')
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(reason in RETURN_REASONS)) return { error: 'Choose a reason.' }
  const limit = await consumeRateLimit(`return:ip:${await clientIp()}`, 10, 60 * 60)
  if (!limit.allowed) return { error: 'Too many attempts. Please try again later.' }
  const found = await loadViewableOrder(parsed.data.orderNumber, parsed.data.key)
  if (!found) return { error: 'We could not find that order.' }
  const lines = [...formData.entries()]
    .filter(([k]) => k.startsWith('qty:'))
    .map(([k, v]) => ({ orderItemId: k.slice(4, 44), quantity: Number(v) }))
  const r = await requestReturn(found.order.id, await getReturnWindowDays(), { lines, reason: reason as ReturnReason, note: String(formData.get('note') ?? '') }, {
    userId: found.user?.id ?? null,
    ip: await clientIp(),
  })
  if (!r.ok) return { error: r.error }
  refresh()
  return { done: true }
}
