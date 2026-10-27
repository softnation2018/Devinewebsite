import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))
const sent: { to: string; subject: string }[] = []
vi.mock('../email', () => ({ sendEmail: async (e: { to: string; subject: string }) => (sent.push(e), { sent: true }) }))

const { recordManualRefund, refundViaRazorpay, resolveStuckRefund, getRefundPanel } = await import('./refunds')
const { handleRazorpayWebhook } = await import('./online')
const { cancelOwnOrder } = await import('../shop/cancel')
const { RazorpayError } = await import('./razorpay')
type RazorpayRefunds = import('./razorpay').RazorpayRefunds

const tag = `it-ref-${Date.now()}`
let n = 0
let staff: { id: string; ip: string }

class FakeRefunds implements RazorpayRefunds {
  calls: { paymentId: string; amount: number }[] = []
  constructor(private mode: 'pending' | 'processed' | 'reject' | 'timeout' = 'pending') {}
  async refundPayment(paymentId: string, amount: number) {
    this.calls.push({ paymentId, amount })
    if (this.mode === 'reject') throw new RazorpayError('bad', 400)
    if (this.mode === 'timeout') throw new RazorpayError('no answer')
    return { id: `rfnd_${tag.replace(/\W/g, '')}${this.calls.length}${n}`, payment_id: paymentId, amount, status: this.mode }
  }
}

async function paidOrder(method: 'RAZORPAY' | 'COD', status: 'CONFIRMED' | 'DELIVERED' = 'DELIVERED') {
  n++
  return db.order.create({
    data: {
      orderNumber: `${tag}-${n}`,
      status,
      paymentMethod: method,
      paymentStatus: 'PAID',
      subtotalPaise: 50_000,
      totalPaise: 50_000,
      shippingAddress: {},
      billingAddress: {},
      payments: {
        create: { provider: method === 'COD' ? 'cod' : 'razorpay', method, status: 'PAID', amountPaise: 50_000, providerPaymentId: method === 'COD' ? null : `pay_${tag}_${n}` },
      },
    },
  })
}

beforeAll(async () => {
  const u = await db.user.create({ data: { email: `${tag}-admin@example.test`, role: 'ADMIN' } })
  staff = { id: u.id, ip: '127.0.0.1' }
})

afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { providerEventId: { startsWith: tag } } })
  const ids = (await db.order.findMany({ where: { orderNumber: { startsWith: tag } }, select: { id: true } })).map((o) => o.id)
  await db.auditLog.deleteMany({ where: { OR: [{ actorUserId: staff.id }, { entityId: { in: ids } }] } })
  await db.order.deleteMany({ where: { id: { in: ids } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('Razorpay refunds', () => {
  it('refunds part, then refuses to go over what was paid', async () => {
    const o = await paidOrder('RAZORPAY')
    const rz = new FakeRefunds('processed')
    expect(await refundViaRazorpay(o.id, 20_000, 'Damaged bead', staff, rz)).toMatchObject({ ok: true })
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED')
    expect(await refundViaRazorpay(o.id, 30_001, 'Too much', staff, rz)).toMatchObject({ ok: false })
    expect(rz.calls).toHaveLength(1)
    expect(await refundViaRazorpay(o.id, 30_000, 'Rest', staff, rz)).toMatchObject({ ok: true })
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('REFUNDED')
    expect((await db.payment.findFirstOrThrow({ where: { orderId: o.id } })).status).toBe('REFUNDED')
    expect(await refundViaRazorpay(o.id, 100, 'Again', staff, rz)).toMatchObject({ ok: false })
  })

  it('two refunds at once cannot both pass the limit', async () => {
    const o = await paidOrder('RAZORPAY')
    const rz = new FakeRefunds('pending')
    const results = await Promise.all([refundViaRazorpay(o.id, 40_000, 'a', staff, rz), refundViaRazorpay(o.id, 40_000, 'b', staff, rz)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(rz.calls).toHaveLength(1)
  })

  it('a pending refund completes only when the webhook says processed', async () => {
    const o = await paidOrder('RAZORPAY')
    const rz = new FakeRefunds('pending')
    await refundViaRazorpay(o.id, 50_000, 'Return', staff, rz)
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: o.id } })
    expect(refund.status).toBe('PROCESSING')
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PAID')

    const secret = 'hook_secret_for_refund_tests'
    const body = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: refund.providerRefundId, payment_id: 'x', amount: 50_000, status: 'processed' } } } })
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(await handleRazorpayWebhook(body, sig, `${tag}-ev1`, secret, { createOrder: vi.fn(), listOrderPayments: vi.fn(), capturePayment: vi.fn() })).toBe('PROCESSED')
    expect(await handleRazorpayWebhook(body, sig, `${tag}-ev1`, secret, { createOrder: vi.fn(), listOrderPayments: vi.fn(), capturePayment: vi.fn() })).toBe('DUPLICATE')
    expect((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('COMPLETED')
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('REFUNDED')
  })

  it('a refused refund is marked failed; no answer leaves it in progress until staff check', async () => {
    const o = await paidOrder('RAZORPAY')
    expect(await refundViaRazorpay(o.id, 10_000, 'x', staff, new FakeRefunds('reject'))).toMatchObject({ ok: false })
    expect((await db.refund.findFirstOrThrow({ where: { orderId: o.id } })).status).toBe('FAILED')

    expect(await refundViaRazorpay(o.id, 10_000, 'y', staff, new FakeRefunds('timeout'))).toMatchObject({ ok: false })
    const stuck = await db.refund.findFirstOrThrow({ where: { orderId: o.id, status: 'PROCESSING' } })
    expect((await getRefundPanel(o.id)).availablePaise).toBe(40_000)
    expect(await resolveStuckRefund(stuck.id, 'COMPLETED', 'not-an-id', staff)).toMatchObject({ ok: false })
    expect(await resolveStuckRefund(stuck.id, 'COMPLETED', 'rfnd_ABC123xyz', staff)).toMatchObject({ ok: true })
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED')
  })
})

describe('COD refunds', () => {
  it('need a reference, cannot reuse one, and are not allowed through Razorpay', async () => {
    const o = await paidOrder('COD')
    expect(await refundViaRazorpay(o.id, 100, 'x', staff, new FakeRefunds())).toMatchObject({ ok: false })
    expect(await recordManualRefund(o.id, 50_000, 'upi', '', 'Return', staff)).toMatchObject({ ok: false })
    const ref = `UTR${n}${Date.now()}`.slice(0, 20)
    expect(await recordManualRefund(o.id, 20_000, 'upi', ref, 'Return', staff)).toMatchObject({ ok: true })
    expect(await recordManualRefund(o.id, 10_000, 'upi', ref, 'Again', staff)).toMatchObject({ ok: false })
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED')
    expect(await db.auditLog.count({ where: { entityId: o.id, action: 'refund.manual' } })).toBe(1)
  })

  it('an unpaid COD order cannot be refunded', async () => {
    const o = await paidOrder('COD')
    await db.order.update({ where: { id: o.id }, data: { paymentStatus: 'PENDING' } })
    expect(await recordManualRefund(o.id, 100, 'upi', 'UTR123456', 'x', staff)).toMatchObject({ ok: false })
  })
})

describe('customer cancellation', () => {
  it('follows the owner’s rule and flags a paid order for refund', async () => {
    const o = await paidOrder('RAZORPAY', 'CONFIRMED')
    expect(await cancelOwnOrder(o.id, 'NEVER', '', { userId: null, ip: null })).toMatchObject({ ok: false })
    await db.order.update({ where: { id: o.id }, data: { status: 'PROCESSING' } })
    expect(await cancelOwnOrder(o.id, 'BEFORE_PROCESSING', '', { userId: null, ip: null })).toMatchObject({ ok: false })
    expect(await cancelOwnOrder(o.id, 'BEFORE_SHIPMENT', 'Ordered twice', { userId: null, ip: null })).toEqual({ ok: true })
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(after).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID', cancelReason: 'Cancelled by customer: Ordered twice' })
    expect(after.adminNote).toContain('refund still to be issued')
    expect(await db.auditLog.count({ where: { entityId: o.id, action: 'order.cancel.customer', actorUserId: null } })).toBe(1)
  })

  it('is refused once a parcel is booked', async () => {
    const o = await paidOrder('COD', 'CONFIRMED')
    await db.shipment.create({ data: { orderId: o.id, provider: 'MANUAL', status: 'CREATED', awbNumber: `AWB${n}${Date.now()}`, idempotencyKey: `${tag}-s${n}` } })
    expect(await cancelOwnOrder(o.id, 'BEFORE_SHIPMENT', '', { userId: null, ip: null })).toMatchObject({ ok: false })
  })
})
