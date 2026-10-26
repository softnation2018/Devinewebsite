// Online payment flow against a real database, with a fake Razorpay so the
// tests can play out success, failure, lost notifications and tampering.
import { createHmac } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import type { CommerceSettings } from '../settings'
import { addToCart, createCart } from '../shop/cart'
import { placeOrder } from '../shop/checkout'
import {
  confirmCheckoutPayment,
  handleRazorpayWebhook,
  reconcileRazorpayOrder,
  releaseUnpaidOrders,
  startOnlinePayment,
} from './online'
import type { RazorpayGateway, RazorpayPayment } from './razorpay'

const tag = `it-pay-${Date.now()}`
const KEY_SECRET = 'key_secret_for_tests'
const HOOK_SECRET = 'webhook_secret_for_tests'
let n = 0
let orderSeq = 0

class FakeRazorpay implements RazorpayGateway {
  orders = new Map<string, { amount: number; payments: RazorpayPayment[] }>()
  created = 0
  captures = 0
  async createOrder({ amountPaise }: { amountPaise: number }) {
    this.created++
    const id = `order_${tag}_${++orderSeq}`
    this.orders.set(id, { amount: amountPaise, payments: [] })
    return { id, amount: amountPaise, currency: 'INR' }
  }
  async listOrderPayments(id: string) {
    return this.orders.get(id)?.payments ?? []
  }
  async capturePayment(paymentId: string, amount: number) {
    this.captures++
    for (const o of this.orders.values()) {
      const p = o.payments.find((x) => x.id === paymentId)
      if (p) {
        p.status = 'captured'
        p.amount = amount
        return p
      }
    }
    throw new Error('no such payment')
  }
  pay(orderId: string, status: RazorpayPayment['status'] = 'captured', amount?: number) {
    const o = this.orders.get(orderId)!
    const p = { id: `pay_${tag}_${o.payments.length + 1}_${orderId.slice(-3)}`, order_id: orderId, amount: amount ?? o.amount, currency: 'INR', status }
    o.payments.push(p)
    return p
  }
}

const settings: CommerceSettings = { shippingFlatPaise: 0, shippingFreeAbovePaise: null, codEnabled: true, codFeePaise: 0, codMinOrderPaise: 0, codMaxOrderPaise: 0 }
let rz: FakeRazorpay
beforeEach(() => {
  rz = new FakeRazorpay()
})

async function onlineOrder(onHand = 5, qty = 1, couponCode: string | null = null) {
  n++
  const p = await db.product.create({
    data: { sku: `${tag}-${n}`, slug: `${tag}-${n}`, name: 'Pay test', pricePaise: 30_000, status: 'PUBLISHED', inventory: { create: { onHand } } },
    select: { id: true, inventory: { select: { id: true } } },
  })
  const cart = await createCart(null)
  await addToCart(cart.id, p.id, null, qty)
  const r = await placeOrder(
    { cartId: cart.id, userId: null, email: `${tag}-${n}@example.test`, address: { fullName: 'A', phone: '9876543210', line1: 'x', line2: null, landmark: null, city: 'Pune', state: 'Maharashtra', pincode: '411001' }, paymentMethod: 'RAZORPAY', couponCode, customerNote: null, saveAddress: false },
    settings,
    true,
  )
  if (!r.ok) throw new Error(r.message)
  return { orderId: r.orderId, inventoryId: p.inventory!.id }
}

const signCheckout = (orderId: string, paymentId: string) => createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
const order = (id: string) => db.order.findUniqueOrThrow({ where: { id }, include: { payments: true } })
const reserved = async (inventoryId: string) => (await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).reserved

afterAll(async () => {
  await db.order.deleteMany({ where: { guestEmail: { startsWith: tag } } })
  await db.cart.deleteMany({ where: { items: { some: { product: { sku: { startsWith: tag } } } } } })
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.coupon.deleteMany({ where: { code: { startsWith: tag.toUpperCase() } } })
  await db.webhookEvent.deleteMany({ where: { providerEventId: { startsWith: tag } } })
  await db.$disconnect()
})

describe('starting a payment', () => {
  it('creates one Razorpay order for the server-side total, and reuses it', async () => {
    const { orderId } = await onlineOrder()
    const a = await startOnlinePayment(orderId, rz)
    const b = await startOnlinePayment(orderId, rz)
    expect(a).toEqual(b)
    expect(rz.created).toBe(1)
    expect(a).toMatchObject({ ok: true, amountPaise: 30_000 })
  })

  it('two tabs at once still create only one Razorpay order', async () => {
    const { orderId } = await onlineOrder()
    await Promise.all([startOnlinePayment(orderId, rz), startOnlinePayment(orderId, rz)])
    expect(rz.created).toBe(1)
  })
})

describe('confirming from checkout', () => {
  it('marks the order paid only after Razorpay reports the capture', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    const pay = rz.pay(start.providerOrderId)
    const cb = { razorpay_order_id: start.providerOrderId, razorpay_payment_id: pay.id, razorpay_signature: signCheckout(start.providerOrderId, pay.id) }

    expect(await confirmCheckoutPayment(orderId, cb, rz, KEY_SECRET)).toBe('PAID')
    const o = await order(orderId)
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
    expect(o.payments[0]).toMatchObject({ status: 'PAID', providerPaymentId: pay.id })
  })

  it('a valid signature is not enough if Razorpay has no captured payment', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    const cb = { razorpay_order_id: start.providerOrderId, razorpay_payment_id: 'pay_made_up', razorpay_signature: signCheckout(start.providerOrderId, 'pay_made_up') }
    expect(await confirmCheckoutPayment(orderId, cb, rz, KEY_SECRET)).toBe('PENDING')
    expect((await order(orderId)).paymentStatus).toBe('PENDING')
  })

  it('rejects a forged signature, or a Razorpay order belonging to another shop order', async () => {
    const a = await onlineOrder()
    const b = await onlineOrder()
    const sa = await startOnlinePayment(a.orderId, rz)
    const sb = await startOnlinePayment(b.orderId, rz)
    if (!sa.ok || !sb.ok) throw new Error()
    const payB = rz.pay(sb.providerOrderId)
    // Paid for order B, then tries to use that payment to confirm order A.
    const reused = { razorpay_order_id: sb.providerOrderId, razorpay_payment_id: payB.id, razorpay_signature: signCheckout(sb.providerOrderId, payB.id) }
    expect(await confirmCheckoutPayment(a.orderId, reused, rz, KEY_SECRET)).toBe('BAD_SIGNATURE')
    const forged = { razorpay_order_id: sa.providerOrderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'f'.repeat(64) }
    expect(await confirmCheckoutPayment(a.orderId, forged, rz, KEY_SECRET)).toBe('BAD_SIGNATURE')
    expect((await order(a.orderId)).paymentStatus).toBe('PENDING')
  })

  it('never accepts a captured payment of the wrong amount', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    rz.pay(start.providerOrderId, 'captured', 100)
    expect(await reconcileRazorpayOrder(start.providerOrderId, rz)).toBe('MISMATCH')
    const o = await order(orderId)
    expect(o.paymentStatus).toBe('PENDING')
    expect(o.adminNote).toMatch(/unexpected amount/)
  })

  it('captures an authorised payment if auto-capture is off', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    rz.pay(start.providerOrderId, 'authorized')
    expect(await reconcileRazorpayOrder(start.providerOrderId, rz)).toBe('PAID')
    expect(rz.captures).toBe(1)
  })
})

describe('webhooks', () => {
  function webhook(event: string, providerOrderId: string) {
    const body = JSON.stringify({ event, payload: { payment: { entity: { order_id: providerOrderId } } } })
    return { body, sig: createHmac('sha256', HOOK_SECRET).update(body).digest('hex') }
  }

  it('records a payment even if the customer closed the browser, and only once', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    rz.pay(start.providerOrderId)
    const { body, sig } = webhook('payment.captured', start.providerOrderId)

    expect(await handleRazorpayWebhook(body, sig, `${tag}-evt-1`, HOOK_SECRET, rz)).toBe('PROCESSED')
    expect(await handleRazorpayWebhook(body, sig, `${tag}-evt-1`, HOOK_SECRET, rz)).toBe('DUPLICATE')
    expect((await order(orderId)).paymentStatus).toBe('PAID')
    expect(await db.webhookEvent.count({ where: { providerEventId: `${tag}-evt-1` } })).toBe(1)
  })

  it('rejects a bad signature and changes nothing', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    rz.pay(start.providerOrderId)
    const { body } = webhook('payment.captured', start.providerOrderId)
    expect(await handleRazorpayWebhook(body, 'bad', `${tag}-evt-2`, HOOK_SECRET, rz)).toBe('BAD_SIGNATURE')
    expect(await handleRazorpayWebhook(body, null, `${tag}-evt-3`, HOOK_SECRET, rz)).toBe('BAD_SIGNATURE')
    expect((await order(orderId)).paymentStatus).toBe('PENDING')
  })

  it('a webhook claiming payment.captured is checked with Razorpay, not believed', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    const { body, sig } = webhook('payment.captured', start.providerOrderId)
    expect(await handleRazorpayWebhook(body, sig, `${tag}-evt-4`, HOOK_SECRET, rz)).toBe('PROCESSED')
    expect((await order(orderId)).paymentStatus).toBe('PENDING')
  })
})

describe('unpaid orders', () => {
  const later = () => new Date(Date.now() + 31 * 60_000)

  it('are cancelled after 30 minutes and their stock and coupon use are given back', async () => {
    const coupon = await db.coupon.create({ data: { code: `${tag.toUpperCase()}-C`, type: 'FIXED', valuePaise: 1_000, usageLimitTotal: 1 } })
    const { orderId, inventoryId } = await onlineOrder(5, 2, coupon.code)
    expect(await reserved(inventoryId)).toBe(2)
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).timesUsed).toBe(1)

    expect(await releaseUnpaidOrders(rz, new Date())).toEqual({ cancelled: 0, paid: 0 })
    const r = await releaseUnpaidOrders(rz, later())
    expect(r.cancelled).toBeGreaterThanOrEqual(1)

    const o = await order(orderId)
    expect(o.status).toBe('CANCELLED')
    expect(await reserved(inventoryId)).toBe(0)
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).timesUsed).toBe(0)
    expect(await db.inventoryMovement.count({ where: { orderId, reason: 'RELEASE' } })).toBe(1)

    // Running again does not release twice.
    await releaseUnpaidOrders(rz, later())
    expect(await reserved(inventoryId)).toBe(0)
  })

  it('a payment whose notification was lost is found and recorded instead of cancelled', async () => {
    const { orderId, inventoryId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    rz.pay(start.providerOrderId)
    await releaseUnpaidOrders(rz, later())
    expect(await order(orderId)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' })
    expect(await reserved(inventoryId)).toBe(1)
  })

  it('a payment that lands after cancellation is flagged for refund, not silently accepted', async () => {
    const { orderId } = await onlineOrder()
    const start = await startOnlinePayment(orderId, rz)
    if (!start.ok) throw new Error()
    await releaseUnpaidOrders(null, later())
    // Cancelled without asking Razorpay (gateway null); then the money arrives and the webhook fires.
    rz.pay(start.providerOrderId)
    expect(await reconcileRazorpayOrder(start.providerOrderId, rz)).toBe('PAID')
    const o = await order(orderId)
    expect(o.status).toBe('CANCELLED')
    expect(o.paymentStatus).toBe('PAID')
    expect(o.adminNote).toMatch(/Refund it or reinstate/)
  })
})
