// Shipping an order: booking a courier, following its tracking, and the
// stock and cash-on-delivery bookkeeping that hangs off it.
//
// Rules this file keeps:
//  - An order has at most one live shipment. The row is written (and the
//    order locked) before the courier is called, so a double click or a
//    retry cannot book a second parcel.
//  - If the courier's answer is lost, the shipment stays "requested" with a
//    warning. Staff check the courier panel and then record the AWB or
//    mark it not created. We never resubmit blindly.
//  - Tracking events are stored exactly as the courier reported them.
//  - Cash on delivery is "collected" only when the courier reports delivery,
//    and the order is marked paid only when staff record the remittance.

import type { Prisma, ShipmentStatus, ShippingProvider as ProviderName } from '@/generated/prisma/client'
import { recordAudit } from '../admin/audit'
import { db } from '../db'
import { queueCustomerEmail } from '../notifications'
import { configuredProviders } from './registry'
import { type Parcel, ProviderRejected, ProviderUnknown, type ShippingProvider, type TrackingResult } from './types'

type Tx = Prisma.TransactionClient
type Actor = { id: string; ip: string | null }
export type ShipResult = { ok: true } | { ok: false; error: string }

/** A shipment in any of these states blocks booking another one. */
export const LIVE: ShipmentStatus[] = ['REQUESTED', 'CREATED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'NDR', 'DELIVERED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED']
/** Still moving, so worth asking the courier about. */
const TRACKABLE: ShipmentStatus[] = ['CREATED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'NDR', 'RTO_IN_TRANSIT']
/** Before the courier has the parcel, so it can still be cancelled. */
const CANCELLABLE: ShipmentStatus[] = ['CREATED', 'PICKUP_SCHEDULED']

export type Box = { weightGrams: number; lengthCm: number; breadthCm: number; heightCm: number }

// ------------------------------------------------------------- status map

/**
 * iThink's documented status names → our shipment status. Anything not in
 * the list (Lost, Damaged, Shortage, new names) leaves the status as it was
 * and is flagged for staff instead of being guessed.
 */
const ITHINK_STATUS: Record<string, ShipmentStatus> = {
  manifested: 'CREATED',
  'not picked': 'PICKUP_SCHEDULED',
  'picked up': 'IN_TRANSIT',
  'in transit': 'IN_TRANSIT',
  'reached at destination': 'IN_TRANSIT',
  delayed: 'IN_TRANSIT',
  misrouted: 'IN_TRANSIT',
  'out for delivery': 'OUT_FOR_DELIVERY',
  undelivered: 'NDR',
  'out of delivery area': 'NDR',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  'rto pending': 'RTO_IN_TRANSIT',
  'rto processing': 'RTO_IN_TRANSIT',
  'rto in transit': 'RTO_IN_TRANSIT',
  'reached at origin': 'RTO_IN_TRANSIT',
  'rto out for delivery': 'RTO_IN_TRANSIT',
  'rto undelivered': 'RTO_IN_TRANSIT',
  'rto delivered': 'RTO_DELIVERED',
}

export function mapCourierStatus(status: string): ShipmentStatus | null {
  return ITHINK_STATUS[status.trim().toLowerCase()] ?? null
}

/** Later stages win; a late-arriving older scan never moves a parcel backwards. */
const STAGE: Record<ShipmentStatus, number> = {
  DRAFT: 0,
  REQUESTED: 1,
  FAILED: 1,
  CREATED: 2,
  PICKUP_SCHEDULED: 3,
  IN_TRANSIT: 4,
  NDR: 5,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 7,
  RTO_IN_TRANSIT: 8,
  RTO_DELIVERED: 9,
  CANCELLED: 10,
}

function canMove(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return false
  if (from === 'DELIVERED' || from === 'RTO_DELIVERED' || from === 'CANCELLED') return false
  // NDR and out-for-delivery alternate while the courier retries.
  if ((from === 'NDR' && to === 'OUT_FOR_DELIVERY') || (from === 'OUT_FOR_DELIVERY' && to === 'NDR')) return true
  return STAGE[to] > STAGE[from]
}

// ----------------------------------------------------------------- parcel

async function buildParcel(orderId: string, reference: string, box: Box): Promise<Parcel> {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  })
  const a = o.shippingAddress as Record<string, string | null>
  return {
    orderNumber: reference,
    orderDate: o.placedAt,
    paymentMode: o.paymentMethod === 'COD' ? 'COD' : 'PREPAID',
    totalPaise: o.totalPaise,
    codAmountPaise: o.paymentMethod === 'COD' ? o.totalPaise : 0,
    shippingPaise: o.shippingPaise + o.codFeePaise,
    discountPaise: o.discountPaise,
    ...box,
    customer: {
      name: a.fullName ?? '',
      phone: a.phone ?? '',
      email: o.user?.email ?? o.guestEmail,
      line1: [a.line1, a.landmark].filter(Boolean).join(', '),
      line2: a.line2,
      city: a.city ?? '',
      state: a.state ?? '',
      pincode: a.pincode ?? '',
    },
    items: o.items.map((i) => ({ name: i.nameSnapshot, sku: i.skuSnapshot, quantity: i.quantity, unitPricePaise: i.unitPricePaise, gstRateBp: i.gstRateBp })),
  }
}

export function suggestedWeightGrams(items: { weightGrams: number; quantity: number }[]): number {
  // Item weights plus a little for the box and padding.
  return items.reduce((s, i) => s + i.weightGrams * i.quantity, 0) + 100
}

// ------------------------------------------------------------------ book

export function validBox(b: Box): string | null {
  if (!Number.isInteger(b.weightGrams) || b.weightGrams < 10 || b.weightGrams > 50_000) return 'Weight: enter grams between 10 and 50,000.'
  for (const [k, v] of [['Length', b.lengthCm], ['Breadth', b.breadthCm], ['Height', b.heightCm]] as const) {
    if (!(v >= 1 && v <= 200)) return `${k}: enter centimetres between 1 and 200.`
  }
  return null
}

/** Locks the order and writes the shipment row. Returns the row, or why not. */
async function reserveShipment(
  tx: Tx,
  orderId: string,
  provider: ProviderName,
  box: Box,
  actor: Actor,
  manual?: { courierName: string; awbNumber: string; trackingUrl: string | null },
) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, totalPaise: true } })
  if (!order) return { error: 'Order not found.' } as const
  if (order.status !== 'CONFIRMED' && order.status !== 'PROCESSING') return { error: `A ${order.status.toLowerCase()} order cannot be shipped.` } as const
  if (order.paymentMethod === 'RAZORPAY' && order.paymentStatus !== 'PAID') return { error: 'This online order is not paid.' } as const
  const live = await tx.shipment.findFirst({ where: { orderId, status: { in: LIVE } }, select: { id: true } })
  if (live) return { error: 'This order already has a shipment. Cancel it first to book another.' } as const

  const attempt = (await tx.shipment.count({ where: { orderId } })) + 1
  const isCod = order.paymentMethod === 'COD'
  const shipment = await tx.shipment.create({
    data: {
      orderId,
      provider,
      status: manual ? 'CREATED' : 'REQUESTED',
      idempotencyKey: `${orderId}:${attempt}`,
      isCod,
      codAmountPaise: isCod ? order.totalPaise : 0,
      weightGrams: box.weightGrams,
      ...(manual ? { awbNumber: manual.awbNumber, courierName: manual.courierName, trackingUrl: manual.trackingUrl } : {}),
    },
  })
  if (order.status === 'CONFIRMED') await tx.order.update({ where: { id: orderId }, data: { status: 'PROCESSING' } })
  if (manual && isCod) await openCodRemittance(tx, orderId, shipment.id, 'MANUAL', manual.awbNumber, order.totalPaise)
  await recordAudit(tx, {
    actorUserId: actor.id,
    ipAddress: actor.ip,
    action: 'shipment.create',
    entityType: 'Order',
    entityId: orderId,
    after: { shipmentId: shipment.id, provider, ...box, ...(manual ?? {}) },
  })
  // The courier sees our order number; a later attempt gets a suffix so a
  // courier that remembers the first booking does not refuse it.
  return { shipment, reference: attempt === 1 ? order.orderNumber : `${order.orderNumber}-${attempt}` } as const
}

async function openCodRemittance(tx: Tx, orderId: string, shipmentId: string, provider: string, awb: string, amountPaise: number) {
  await tx.codRemittance.create({ data: { orderId, shipmentId, provider, providerRef: awb, amountPaise, status: 'AWAITED' } })
}

/** Books a parcel with a courier through its API. */
export async function bookShipment(orderId: string, providerName: 'ITHINK' | 'SHIPROCKET', box: Box, actor: Actor, providers?: ShippingProvider[]): Promise<ShipResult> {
  const bad = validBox(box)
  if (bad) return { ok: false, error: bad }
  const provider = (providers ?? configuredProviders()).find((p) => p.name === providerName)
  if (!provider) return { ok: false, error: 'That courier is not set up yet.' }

  const r = await db.$transaction((tx) => reserveShipment(tx, orderId, providerName, box, actor))
  if ('error' in r) return { ok: false, error: r.error as string }
  const { shipment, reference } = r

  try {
    const created = await provider.createShipment(await buildParcel(orderId, reference, box))
    await db.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: 'CREATED', awbNumber: created.awbNumber, providerShipmentId: created.providerShipmentId, courierName: created.courierName, trackingUrl: created.trackingUrl, attemptCount: 1, lastError: null },
      })
      if (shipment.isCod) await openCodRemittance(tx, orderId, shipment.id, providerName, created.awbNumber, shipment.codAmountPaise)
    })
    return { ok: true }
  } catch (e) {
    if (e instanceof ProviderRejected) {
      await db.shipment.update({ where: { id: shipment.id }, data: { status: 'FAILED', lastError: e.message, attemptCount: 1 } })
      return { ok: false, error: e.message }
    }
    const message =
      e instanceof ProviderUnknown
        ? e.message
        : 'Something went wrong while booking.'
    await db.shipment.update({
      where: { id: shipment.id },
      data: {
        attemptCount: 1,
        lastError: `${message} Check the ${provider.label} panel: if the parcel is there, enter its AWB; if not, mark this booking as not created.`,
        ...(e instanceof ProviderUnknown && e.partial?.providerShipmentId ? { providerShipmentId: e.partial.providerShipmentId } : {}),
      },
    })
    if (!(e instanceof ProviderUnknown)) console.error('Shipment booking failed', e)
    return { ok: false, error: `We could not confirm the booking. ${message}` }
  }
}

/** Records a parcel sent some other way (a local courier, India Post, or a courier panel used by hand). */
export async function recordManualShipment(orderId: string, details: { courierName: string; awbNumber: string; trackingUrl: string | null }, box: Box, actor: Actor): Promise<ShipResult> {
  const courierName = details.courierName.trim().slice(0, 80)
  const awbNumber = details.awbNumber.trim().slice(0, 60)
  if (!courierName || !awbNumber) return { ok: false, error: 'Enter the courier name and the tracking (AWB) number.' }
  if (details.trackingUrl && !/^https:\/\/[^\s]+$/.test(details.trackingUrl)) return { ok: false, error: 'The tracking link must start with https://' }
  const bad = validBox(box)
  if (bad) return { ok: false, error: bad }
  try {
    const r = await db.$transaction((tx) => reserveShipment(tx, orderId, 'MANUAL', box, actor, { courierName, awbNumber, trackingUrl: details.trackingUrl }))
    return 'error' in r ? { ok: false, error: r.error as string } : { ok: true }
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') return { ok: false, error: 'Another shipment already uses this AWB number.' }
    throw e
  }
}

/** For a booking whose outcome was lost: staff found it in the courier panel. */
export async function confirmRequestedShipment(shipmentId: string, awbNumber: string, actor: Actor): Promise<ShipResult> {
  const awb = awbNumber.trim().slice(0, 60)
  if (!awb) return { ok: false, error: 'Enter the AWB number from the courier panel.' }
  try {
    return await db.$transaction(async (tx) => {
      const s = await tx.shipment.findUnique({ where: { id: shipmentId } })
      if (!s || s.status !== 'REQUESTED') return { ok: false as const, error: 'Only a booking waiting for confirmation can be completed here.' }
      await tx.shipment.update({ where: { id: shipmentId }, data: { status: 'CREATED', awbNumber: awb, lastError: null } })
      if (s.isCod) await openCodRemittance(tx, s.orderId, s.id, s.provider, awb, s.codAmountPaise)
      await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'shipment.confirm', entityType: 'Order', entityId: s.orderId, after: { shipmentId, awbNumber: awb } })
      return { ok: true as const }
    })
  } catch (e) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') return { ok: false, error: 'Another shipment already uses this AWB number.' }
    throw e
  }
}

/** For a booking whose outcome was lost: staff checked and the courier has no such parcel. */
export async function markRequestNotCreated(shipmentId: string, actor: Actor): Promise<ShipResult> {
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.findUnique({ where: { id: shipmentId } })
    if (!s || s.status !== 'REQUESTED') return { ok: false as const, error: 'Only a booking waiting for confirmation can be closed here.' }
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: 'FAILED', lastError: 'Staff confirmed it was not created at the courier.' } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'shipment.not_created', entityType: 'Order', entityId: s.orderId, after: { shipmentId } })
    return { ok: true as const }
  })
}

/** Cancels a booked parcel the courier has not picked up yet. */
export async function cancelShipment(shipmentId: string, actor: Actor, providers?: ShippingProvider[]): Promise<ShipResult> {
  const s = await db.shipment.findUnique({ where: { id: shipmentId } })
  if (!s) return { ok: false, error: 'Shipment not found.' }
  if (!CANCELLABLE.includes(s.status)) return { ok: false, error: 'Only a parcel not yet picked up can be cancelled here.' }
  if (s.provider !== 'MANUAL') {
    const provider = (providers ?? configuredProviders()).find((p) => p.name === s.provider)
    if (!provider) return { ok: false, error: 'This courier is no longer set up, so the booking must be cancelled in its own panel.' }
    try {
      await provider.cancel({ awbNumber: s.awbNumber, providerShipmentId: s.providerShipmentId })
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'The courier did not confirm the cancellation.' }
    }
  }
  await db.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    await tx.codRemittance.updateMany({ where: { shipmentId, status: 'AWAITED' }, data: { status: 'FAILED', note: 'Shipment cancelled before pickup.' } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'shipment.cancel', entityType: 'Order', entityId: s.orderId, after: { shipmentId } })
  })
  return { ok: true }
}

// ------------------------------------------------------------- progress

/** Turns the order's held stock into a sale, once, when the parcel leaves. */
async function convertReservationToSale(tx: Tx, orderId: string) {
  const already = await tx.inventoryMovement.count({ where: { orderId, reason: 'SALE' } })
  if (already > 0) return
  const held = await tx.inventoryMovement.groupBy({ by: ['inventoryId'], where: { orderId, reason: { in: ['RESERVATION', 'RELEASE'] } }, _sum: { delta: true } })
  for (const h of [...held].sort((a, b) => a.inventoryId.localeCompare(b.inventoryId))) {
    const qty = h._sum.delta ?? 0
    if (qty <= 0) continue
    await tx.inventory.update({ where: { id: h.inventoryId }, data: { reserved: { decrement: qty }, onHand: { decrement: qty } } })
    await tx.inventoryMovement.create({ data: { inventoryId: h.inventoryId, delta: -qty, reason: 'RELEASE', orderId, note: 'Hold ended: parcel shipped' } })
    await tx.inventoryMovement.create({ data: { inventoryId: h.inventoryId, delta: -qty, reason: 'SALE', orderId, note: 'Shipped' } })
  }
}

/** What follows from a shipment reaching a new status. Runs inside the caller's transaction. */
async function applyShipmentStatus(tx: Tx, shipmentId: string, to: ShipmentStatus, at: Date, source: 'courier' | 'staff') {
  const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { order: { select: { id: true, status: true, adminNote: true } } } })
  if (!canMove(s.status, to)) return false
  await tx.shipment.update({ where: { id: shipmentId }, data: { status: to, ...(to === 'DELIVERED' ? { deliveredAt: at } : {}), ...(to === 'CANCELLED' ? { cancelledAt: at } : {}) } })
  const order = s.order

  if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'NDR', 'DELIVERED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED'].includes(to)) {
    await convertReservationToSale(tx, order.id)
    if (order.status === 'CONFIRMED' || order.status === 'PROCESSING') {
      await tx.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } })
      if (to !== 'DELIVERED') await queueCustomerEmail(tx, { kind: 'order_shipped', orderId: order.id })
    }
  }
  if (to === 'DELIVERED') {
    if (order.status !== 'DELIVERED') await queueCustomerEmail(tx, { kind: 'order_delivered', orderId: order.id })
    await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: at } })
    // The courier has the cash now; the shop does not until it is remitted.
    await tx.codRemittance.updateMany({
      where: { shipmentId, status: 'AWAITED' },
      data: { status: 'COLLECTED', collectedAt: at, note: source === 'courier' ? 'Courier reports the parcel delivered.' : 'Staff recorded the parcel as delivered.' },
    })
  }
  if (to === 'RTO_DELIVERED') {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'RETURNED', adminNote: [order.adminNote, 'Parcel came back undelivered. Check it, then add it back to stock from the product page.'].filter(Boolean).join('\n') },
    })
    await tx.codRemittance.updateMany({ where: { shipmentId, status: 'AWAITED' }, data: { status: 'FAILED', note: 'Returned to us undelivered.' } })
  }
  if (to === 'CANCELLED') {
    await tx.codRemittance.updateMany({ where: { shipmentId, status: 'AWAITED' }, data: { status: 'FAILED', note: 'Courier cancelled the shipment.' } })
  }
  return true
}

/** Staff updates for parcels sent without a courier integration. */
export async function setManualShipmentStatus(shipmentId: string, to: 'IN_TRANSIT' | 'DELIVERED', actor: Actor): Promise<ShipResult> {
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { provider: true, orderId: true, status: true } })
    if (!s) return { ok: false as const, error: 'Shipment not found.' }
    if (s.provider !== 'MANUAL') return { ok: false as const, error: 'This shipment is updated by the courier’s tracking.' }
    if (!(await applyShipmentStatus(tx, shipmentId, to, new Date(), 'staff'))) return { ok: false as const, error: 'The shipment is already past that stage.' }
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'shipment.status', entityType: 'Order', entityId: s.orderId, before: { status: s.status }, after: { shipmentId, status: to } })
    return { ok: true as const }
  })
}

/** Stores the courier's scans as reported and moves the shipment along. */
export async function applyTracking(shipmentId: string, t: TrackingResult): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${shipmentId} FOR UPDATE`
    if (t.scans.length) {
      await tx.shipmentEvent.createMany({
        data: t.scans.map((s) => ({
          shipmentId,
          providerCode: `${s.code ?? ''}|${s.status}`.slice(0, 120),
          status: s.status.slice(0, 120),
          description: s.remark?.slice(0, 500) ?? null,
          location: s.location?.slice(0, 120) ?? null,
          occurredAt: s.occurredAt,
        })),
        skipDuplicates: true,
      })
    }
    const to = mapCourierStatus(t.currentStatus)
    const at = t.scans.reduce<Date | null>((latest, s) => (!latest || s.occurredAt > latest ? s.occurredAt : latest), null) ?? new Date()
    if (to) {
      await applyShipmentStatus(tx, shipmentId, to, at, 'courier')
      await tx.shipment.update({ where: { id: shipmentId }, data: { lastError: null } })
    } else {
      await tx.shipment.update({ where: { id: shipmentId }, data: { lastError: `Courier reports “${t.currentStatus.slice(0, 80)}”. Please check with the courier.` } })
    }
  })
}

/** Asks each courier about parcels still on the move. Run by the cron job. */
export async function refreshTracking(providers = configuredProviders(), limit = 200): Promise<{ checked: number; updated: number; errors: number }> {
  let checked = 0
  let updated = 0
  let errors = 0
  for (const provider of providers) {
    if (!provider.track) continue
    const live = await db.shipment.findMany({
      where: { provider: provider.name, status: { in: TRACKABLE }, awbNumber: { not: null } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, awbNumber: true },
    })
    if (live.length === 0) continue
    let results: TrackingResult[] = []
    try {
      results = await provider.track(live.map((s) => s.awbNumber!))
    } catch (e) {
      errors++
      console.error(`Tracking ${provider.name} failed`, e instanceof Error ? e.message : e)
      continue
    }
    checked += live.length
    for (const r of results) {
      const s = live.find((x) => x.awbNumber === r.awbNumber)
      if (!s) continue
      await applyTracking(s.id, r)
      updated++
    }
  }
  return { checked, updated, errors }
}

// ------------------------------------------------------------------- COD

/** Staff record the courier's payout for a delivered COD parcel. Only then is the order paid. */
export async function recordCodRemittance(remittanceId: string, input: { utrNumber: string; amountPaise: number; remittedAt: Date }, actor: Actor): Promise<ShipResult> {
  const utr = input.utrNumber.trim().slice(0, 40)
  if (!/^[A-Za-z0-9-]{6,40}$/.test(utr)) return { ok: false, error: 'Enter the bank reference (UTR) of the payout.' }
  if (input.remittedAt > new Date()) return { ok: false, error: 'The payout date cannot be in the future.' }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CodRemittance" WHERE id = ${remittanceId} FOR UPDATE`
    const r = await tx.codRemittance.findUnique({ where: { id: remittanceId } })
    if (!r) return { ok: false as const, error: 'Not found.' }
    if (r.status !== 'COLLECTED') {
      return { ok: false as const, error: r.status === 'AWAITED' ? 'The parcel has not been delivered yet, so there is no cash to remit.' : 'This remittance is already closed.' }
    }
    if (input.amountPaise !== r.amountPaise) {
      return { ok: false as const, error: 'The amount does not match what the customer was to pay. Check the courier’s statement for deductions and settle the difference with them first.' }
    }
    await tx.codRemittance.update({ where: { id: r.id }, data: { status: 'REMITTED', remittedAt: input.remittedAt, utrNumber: utr } })
    await tx.payment.updateMany({ where: { orderId: r.orderId, method: 'COD', status: 'PENDING' }, data: { status: 'PAID' } })
    await tx.order.update({ where: { id: r.orderId }, data: { paymentStatus: 'PAID' } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'cod.remitted', entityType: 'Order', entityId: r.orderId, after: { remittanceId: r.id, utr, amountPaise: r.amountPaise } })
    return { ok: true as const }
  })
}

export function getShippingForOrder(orderId: string) {
  return Promise.all([
    db.shipment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { occurredAt: 'desc' } } } }),
    db.codRemittance.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } }),
  ])
}
