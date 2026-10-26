import { handleRazorpayWebhook } from '@/server/payments/online'
import { razorpay } from '@/server/payments/razorpay'

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })

  // The signature covers the exact bytes Razorpay sent, so read the raw text.
  const raw = await request.text()
  const outcome = await handleRazorpayWebhook(
    raw,
    request.headers.get('x-razorpay-signature'),
    request.headers.get('x-razorpay-event-id'),
    secret,
    razorpay,
  )
  if (outcome === 'BAD_SIGNATURE') return new Response('Invalid signature', { status: 401 })
  return Response.json({ ok: true, outcome })
}
