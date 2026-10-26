import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyCheckoutSignature, verifyWebhookSignature } from './razorpay'

const secret = 'test_secret'
const sign = (s: string, k = secret) => createHmac('sha256', k).update(s).digest('hex')

describe('verifyCheckoutSignature', () => {
  it('accepts the HMAC of "order_id|payment_id" made with the key secret', () => {
    expect(verifyCheckoutSignature('order_1', 'pay_1', sign('order_1|pay_1'), secret)).toBe(true)
  })
  it('rejects a signature for another order, another payment, another key, or junk', () => {
    expect(verifyCheckoutSignature('order_2', 'pay_1', sign('order_1|pay_1'), secret)).toBe(false)
    expect(verifyCheckoutSignature('order_1', 'pay_2', sign('order_1|pay_1'), secret)).toBe(false)
    expect(verifyCheckoutSignature('order_1', 'pay_1', sign('order_1|pay_1', 'other'), secret)).toBe(false)
    expect(verifyCheckoutSignature('order_1', 'pay_1', 'abc', secret)).toBe(false)
  })
})

describe('verifyWebhookSignature', () => {
  it('signs the exact raw body; any byte change fails', () => {
    const body = '{"event":"payment.captured","payload":{}}'
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true)
    expect(verifyWebhookSignature(body + ' ', sign(body), secret)).toBe(false)
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 1), sign(body), secret)).toBe(false)
  })
})
