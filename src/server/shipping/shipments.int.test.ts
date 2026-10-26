import { afterAll, describe, expect, it } from 'vitest'
import { cancelOrder } from '../admin/orders'
import { db } from '../db'
import type { CommerceSettings } from '../settings'
import { addToCart, createCart } from '../shop/cart'
import { placeOrder } from '../shop/checkout'
import {
  applyTracking,
  bookShipment,
  cancelShipment,
  confirmRequestedShipment,
  recordCodRemittance,
  recordManualShipment,
  refreshTracking,
  setManualShipmentStatus,
} from './shipments'
import { type CreatedShipment, type Parcel, ProviderRejected, ProviderUnknown, type ShippingProvider, type TrackingResult } from './types'

const tag = `it-ship-${Date.now()}`
let n = 0
let awbSeq = 0
const settings: CommerceSettings = { shippingFlatPaise: 0, shippingFreeAbovePaise: null, codEnabled: true, codFeePaise: 0, codMinOrderPaise: 0, codMaxOrderPaise: 0 }
const box = { weightGrams: 350, lengthCm: 15, breadthCm: 12, heightCm: 8 }

/** A courier that does whatever the test tells it to, and remembers what it was sent. */
class FakeCourier implements ShippingProvider {
  readonly name = 'ITHINK' as const
  readonly label = 'Fake iThink'
  sent: Parcel[] = []
  next: 'ok' | 'reject' | 'unknown' = 'ok'
  delayMs = 0
  tracking = new Map<string, TrackingResult>()
  cancelled: string[] = []
  async createShipment(p: Parcel): Promise<CreatedShipment> {
    this.sent.push(p)
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs))
    if (this.next === 'reject') throw new ProviderRejected('Pincode not serviceable')
    if (this.next === 'unknown') throw new ProviderUnknown('No answer from the courier (TimeoutError).')
    return { awbNumber: `${tag}-AWB-${++awbSeq}`, providerShipmentId: null, courierName: 'delhivery', trackingUrl: null }
  }
  track = async (awbs: string[]) => awbs.flatMap((a) => (this.tracking.has(a) ? [this.tracking.get(a)!] : []))
  async cancel({ awbNumber }: { awbNumber: string | null }) {
    this.cancelled.push(awbNumber!)
  }
  labelPdf = null
}

async function actor() {
  const u = await db.user.create({ data: { email: `${tag}-${++n}@example.test`, role: 'ADMIN' } })
  return { id: u.id, ip: null }
}

async function codOrder(qty = 2) {
  n++
  const p = await db.product.create({
    data: { sku: `${tag}-${n}`, slug: `${tag}-${n}`, name: 'Ship test', pricePaise: 20_000, status: 'PUBLISHED', weightGrams: 120, inventory: { create: { onHand: 5 } } },
    select: { id: true, inventory: { select: { id: true } } },
  })
  const cart = await createCart(null)
  await addToCart(cart.id, p.id, null, qty)
  const r = await placeOrder(
    { cartId: cart.id, userId: null, email: `${tag}-g${n}@example.test`, address: { fullName: 'Asha Verma', phone: '9876543210', line1: '12 MG Road', line2: null, landmark: null, city: 'Pune', state: 'Maharashtra', pincode: '411001' }, paymentMethod: 'COD', couponCode: null, customerNote: null, saveAddress: false },
    settings,
    false,
  )
  if (!r.ok) throw new Error(r.message)
  return { orderId: r.orderId, inventoryId: p.inventory!.id }
}

const scan = (status: string, at: string) => ({ status, code: 'UD', location: 'Pune', remark: null, occurredAt: new Date(at) })

afterAll(async () => {
  await db.order.deleteMany({ where: { guestEmail: { startsWith: tag } } })
  await db.cart.deleteMany({ where: { items: { some: { product: { sku: { startsWith: tag } } } } } })
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.auditLog.deleteMany({ where: { actor: { email: { startsWith: tag } } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('booking a courier', () => {
  it('books once, records the AWB, opens the COD record, and refuses a second booking', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId } = await codOrder()
    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toEqual({ ok: true })
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipments: true, codRemits: true } })
    expect(order.status).toBe('PROCESSING')
    expect(order.shipments[0]).toMatchObject({ status: 'CREATED', awbNumber: `${tag}-AWB-1`, isCod: true, codAmountPaise: order.totalPaise })
    expect(order.codRemits[0]).toMatchObject({ status: 'AWAITED', amountPaise: order.totalPaise })
    expect(courier.sent[0]).toMatchObject({ orderNumber: order.orderNumber, paymentMode: 'COD', weightGrams: 350 })

    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toMatchObject({ ok: false })
    expect(courier.sent).toHaveLength(1)
  })

  it('lets only one of two simultaneous clicks reach the courier', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    courier.delayMs = 150
    const { orderId } = await codOrder()
    const results = await Promise.all([bookShipment(orderId, 'ITHINK', box, a, [courier]), bookShipment(orderId, 'ITHINK', box, a, [courier])])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(courier.sent).toHaveLength(1)
    expect(await db.shipment.count({ where: { orderId } })).toBe(1)
  })

  it('after a refusal, allows a new booking with a fresh reference', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId } = await codOrder()
    courier.next = 'reject'
    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toEqual({ ok: false, error: 'Pincode not serviceable' })
    courier.next = 'ok'
    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toEqual({ ok: true })
    expect(courier.sent[1].orderNumber).toBe(`${courier.sent[0].orderNumber}-2`)
  })

  it('when the answer is lost, blocks rebooking until staff confirm what happened', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId } = await codOrder()
    courier.next = 'unknown'
    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toMatchObject({ ok: false })
    const s = await db.shipment.findFirstOrThrow({ where: { orderId } })
    expect(s.status).toBe('REQUESTED')
    expect(s.lastError).toMatch(/Check the Fake iThink panel/)
    courier.next = 'ok'
    expect(await bookShipment(orderId, 'ITHINK', box, a, [courier])).toMatchObject({ ok: false })
    expect(courier.sent).toHaveLength(1)
    // Cannot cancel the order under a possible live parcel either.
    expect(await cancelOrder(orderId, 'changed mind', a)).toMatchObject({ ok: false })
    expect(await confirmRequestedShipment(s.id, 'FOUND-IN-PANEL-1', a)).toEqual({ ok: true })
    expect(await db.codRemittance.count({ where: { shipmentId: s.id, status: 'AWAITED' } })).toBe(1)
  })
})

describe('tracking and cash on delivery', () => {
  it('stores scans once, ships the stock, and treats COD as paid only after the payout is recorded', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId, inventoryId } = await codOrder(2)
    await bookShipment(orderId, 'ITHINK', box, a, [courier])
    const s = await db.shipment.findFirstOrThrow({ where: { orderId } })
    const awb = s.awbNumber!

    const inTransit = { awbNumber: awb, currentStatus: 'In Transit', currentCode: 'UD', expectedDelivery: null, scans: [scan('Manifested', '2026-11-02T10:00:00Z'), scan('In Transit', '2026-11-02T14:00:00Z')] }
    await applyTracking(s.id, inTransit)
    await applyTracking(s.id, inTransit)
    expect(await db.shipmentEvent.count({ where: { shipmentId: s.id } })).toBe(2)
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('SHIPPED')
    expect(await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).toMatchObject({ onHand: 3, reserved: 0 })
    expect(await db.inventoryMovement.count({ where: { orderId, reason: 'SALE' } })).toBe(1)

    // A late, older status never moves it backwards.
    await applyTracking(s.id, { ...inTransit, currentStatus: 'Manifested', scans: [] })
    expect((await db.shipment.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('IN_TRANSIT')

    // Through the cron path, with the courier reporting delivery.
    courier.tracking.set(awb, { ...inTransit, currentStatus: 'Delivered', currentCode: 'DL', scans: [scan('Delivered', '2026-11-04T08:00:00Z')] })
    const result = await refreshTracking([courier])
    expect(result.updated).toBeGreaterThanOrEqual(1)
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { codRemits: true, payments: true } })
    expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PENDING' })
    expect(order.codRemits[0]).toMatchObject({ status: 'COLLECTED' })
    expect(order.payments[0].status).toBe('PENDING')
    // Stock was only taken once.
    expect(await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).toMatchObject({ onHand: 3, reserved: 0 })

    const rem = order.codRemits[0]
    expect(await recordCodRemittance(rem.id, { utrNumber: 'UTR12345678', amountPaise: rem.amountPaise - 100, remittedAt: new Date() }, a)).toMatchObject({ ok: false })
    expect(await recordCodRemittance(rem.id, { utrNumber: 'UTR12345678', amountPaise: rem.amountPaise, remittedAt: new Date() }, a)).toEqual({ ok: true })
    expect(await recordCodRemittance(rem.id, { utrNumber: 'UTR12345678', amountPaise: rem.amountPaise, remittedAt: new Date() }, a)).toMatchObject({ ok: false })
    const paid = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } })
    expect(paid.paymentStatus).toBe('PAID')
    expect(paid.payments[0].status).toBe('PAID')
  })

  it('refuses a payout before delivery, and flags statuses it does not know', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId } = await codOrder()
    await bookShipment(orderId, 'ITHINK', box, a, [courier])
    const s = await db.shipment.findFirstOrThrow({ where: { orderId }, include: { codRemits: true } })
    expect(await recordCodRemittance(s.codRemits[0].id, { utrNumber: 'UTR12345678', amountPaise: s.codAmountPaise, remittedAt: new Date() }, a)).toMatchObject({ ok: false })
    await applyTracking(s.id, { awbNumber: s.awbNumber!, currentStatus: 'Lost', currentCode: 'Lost', expectedDelivery: null, scans: [] })
    const after = await db.shipment.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.status).toBe('CREATED')
    expect(after.lastError).toMatch(/Lost/)
  })

  it('cancels before pickup with the courier, and closes the COD record', async () => {
    const a = await actor()
    const courier = new FakeCourier()
    const { orderId } = await codOrder()
    await bookShipment(orderId, 'ITHINK', box, a, [courier])
    const s = await db.shipment.findFirstOrThrow({ where: { orderId } })
    expect(await cancelShipment(s.id, a, [courier])).toEqual({ ok: true })
    expect(courier.cancelled).toEqual([s.awbNumber])
    expect(await db.codRemittance.findFirstOrThrow({ where: { shipmentId: s.id } })).toMatchObject({ status: 'FAILED' })
    // Now the order may be cancelled, and its stock goes back.
    expect(await cancelOrder(orderId, 'customer asked', a)).toEqual({ ok: true })
  })
})

describe('parcels sent by hand', () => {
  it('records the courier and lets staff mark progress, never creating courier events', async () => {
    const a = await actor()
    const { orderId, inventoryId } = await codOrder(1)
    expect(await recordManualShipment(orderId, { courierName: 'India Post', awbNumber: `${tag}-EM1`, trackingUrl: 'http://not-https' }, box, a)).toMatchObject({ ok: false })
    expect(await recordManualShipment(orderId, { courierName: 'India Post', awbNumber: `${tag}-EM1`, trackingUrl: null }, box, a)).toEqual({ ok: true })
    const s = await db.shipment.findFirstOrThrow({ where: { orderId } })
    expect(await setManualShipmentStatus(s.id, 'DELIVERED', a)).toEqual({ ok: true })
    expect(await setManualShipmentStatus(s.id, 'IN_TRANSIT', a)).toMatchObject({ ok: false })
    expect(await db.shipmentEvent.count({ where: { shipmentId: s.id } })).toBe(0)
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('DELIVERED')
    expect(await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).toMatchObject({ onHand: 4, reserved: 0 })
    expect(await db.codRemittance.findFirstOrThrow({ where: { shipmentId: s.id } })).toMatchObject({ status: 'COLLECTED', note: 'Staff recorded the parcel as delivered.' })
  })
})
