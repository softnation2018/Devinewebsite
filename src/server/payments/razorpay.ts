// Razorpay REST client and signature checks. Only the endpoints documented
// at razorpay.com/docs/api are used:
//   POST /v1/orders                 create an order
//   GET  /v1/orders/{id}/payments   payments made against an order
//   POST /v1/payments/{id}/capture  capture an authorised payment
// Keys come from the environment and never reach the browser, except the
// public key id which Razorpay Checkout needs.

import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.razorpay.com/v1'

export type RazorpayPayment = {
  id: string
  order_id: string | null
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method?: string
  error_description?: string | null
}

/** The calls the shop makes to Razorpay. An interface, so tests can use a fake. */
export interface RazorpayGateway {
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amount: number; currency: string }>
  listOrderPayments(providerOrderId: string): Promise<RazorpayPayment[]>
  capturePayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment>
}

export class RazorpayError extends Error {}

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) throw new RazorpayError('Razorpay keys are not configured')
  return { keyId, keySecret }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = credentials()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    // Razorpay error bodies describe the request, never our secret; log the code only.
    throw new RazorpayError(`Razorpay ${method} ${path.split('/')[1]} failed: HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export const razorpay: RazorpayGateway = {
  createOrder: ({ amountPaise, receipt, notes }) =>
    call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
  listOrderPayments: async (providerOrderId) =>
    (await call<{ items: RazorpayPayment[] }>('GET', `/orders/${encodeURIComponent(providerOrderId)}/payments`)).items,
  capturePayment: (paymentId, amountPaise) =>
    call('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' }),
}

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Checkout's success callback. `ourOrderId` must come from our own records,
 * never from the browser, as Razorpay's docs require.
 */
export function verifyCheckoutSignature(ourOrderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = createHmac('sha256', keySecret).update(`${ourOrderId}|${paymentId}`).digest('hex')
  return safeEqualHex(expected, signature)
}

/** Webhooks: HMAC-SHA256 of the exact raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  return safeEqualHex(expected, signature)
}
