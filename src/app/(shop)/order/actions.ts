'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { clientIp } from '@/server/auth/session'
import { confirmCheckoutPayment, startOnlinePayment } from '@/server/payments/online'
import { razorpay } from '@/server/payments/razorpay'
import { consumeRateLimit } from '@/server/rate-limit'
import { onlinePaymentAvailable } from '@/server/settings'
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
