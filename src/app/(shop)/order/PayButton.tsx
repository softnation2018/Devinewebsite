'use client'

import { useState } from 'react'
import { formatPaise } from '@/lib/money'
import { confirmPaymentAction, startPaymentAction } from './actions'

type RazorpayInstance = { open(): void; on(event: string, cb: (r: unknown) => void): void }
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Razorpay'))
    document.body.appendChild(s)
  })
}

export function PayButton({ orderNumber, accessKey, totalPaise }: { orderNumber: string; accessKey: string | null; totalPaise: number }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setMessage(null)
    try {
      const start = await startPaymentAction(orderNumber, accessKey)
      if (!start.ok) {
        setMessage(start.error)
        return
      }
      await loadCheckoutScript()
      const rzp = new window.Razorpay!({
        key: start.keyId,
        order_id: start.providerOrderId,
        amount: start.amountPaise,
        currency: 'INR',
        name: 'Divine Mantra',
        description: `Order ${orderNumber}`,
        prefill: start.prefill,
        theme: { color: '#5b0f1a' },
        handler: async (response: unknown) => {
          setMessage('Confirming your payment…')
          const { state } = await confirmPaymentAction(orderNumber, accessKey, response)
          setMessage(
            state === 'PAID'
              ? 'Payment received. Thank you!'
              : state === 'PENDING'
                ? 'We are waiting for Razorpay to confirm your payment. This page will update when it does.'
                : 'We could not confirm this payment. If money left your account, it will be matched automatically or refunded by Razorpay.',
          )
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', () => setMessage('The payment did not go through. You can try again.'))
      rzp.open()
    } catch {
      setMessage('Something went wrong starting the payment. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="w-full rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800 disabled:opacity-60 sm:w-auto"
      >
        {busy ? 'Opening payment…' : `Pay ${formatPaise(totalPaise)}`}
      </button>
      <p aria-live="polite" className="text-sm">
        {message}
      </p>
    </div>
  )
}
