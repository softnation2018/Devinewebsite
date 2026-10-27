// Online payments through Razorpay. The rule throughout: an order is marked
// paid only after Razorpay's own API reports a captured payment for the
// right amount. A message from the browser, even with a valid signature,
// only prompts us to ask Razorpay; it is never proof by itself.

import type { Prisma } from '@/generated/prisma/client'
import { applyRefundWebhook } from './refunds'
import { db } from '../db'
import { type RazorpayGateway, type RazorpayPayment, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay'

type Tx = Prisma.TransactionClient

export const UNPAID_ORDER_MINUTES = 30

// ------------------------------------------------------------ start paying

export type StartPayment =
  | { ok: true; providerOrderId: string; amountPaise: number }
  | { ok: false; reason: 'NOT_PAYABLE' }

/** Gets (or creates once) the Razorpay order that this shop order is paid against. */
export async function startOnlinePayment(orderId: string, gateway: RazorpayGateway): Promise<StartPayment> {
  return db.$transaction(
    async (tx) => {
      // Locking the order row means two tabs cannot create two Razorpay orders.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, totalPaise: true },
      })
      if (!order || order.paymentMethod !== 'RAZORPAY' || order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') {
        return { ok: false, reason: 'NOT_PAYABLE' } as const
      }
      const existing = await tx.payment.findFirst({
        where: { orderId, provider: 'razorpay', status: 'PENDING', providerOrderId: { not: null } },
        select: { providerOrderId: true, amountPaise: true },
      })
      if (existing && existing.amountPaise === order.totalPaise) {
        return { ok: true, providerOrderId: existing.providerOrderId!, amountPaise: existing.amountPaise } as const
      }
      const created = await gateway.createOrder({
        amountPaise: order.totalPaise,
        receipt: order.orderNumber,
        notes: { orderNumber: order.orderNumber },
      })
      if (created.amount !== order.totalPaise || created.currency !== 'INR') {
        throw new Error('Razorpay order does not match the shop order')
      }
      await tx.payment.create({
        data: { orderId, provider: 'razorpay', method: 'RAZORPAY', status: 'PENDING', amountPaise: order.totalPaise, providerOrderId: created.id },
      })
      return { ok: true, providerOrderId: created.id, amountPaise: order.totalPaise } as const
    },
    { timeout: 20_000 },
  )
}

// --------------------------------------------------------------- reconcile

export type PaymentState = 'PAID' | 'PENDING' | 'FAILED' | 'MISMATCH'

/**
 * Asks Razorpay what happened to one of our Razorpay orders and records it.
 * Safe to call any number of times, from any path (checkout, webhook, cron).
 */
export async function reconcileRazorpayOrder(providerOrderId: string, gateway: RazorpayGateway): Promise<PaymentState> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId },
    select: { id: true, orderId: true, amountPaise: true, status: true },
  })
  if (!payment) return 'PENDING'
  if (payment.status === 'PAID') return 'PAID'

  const remote = await gateway.listOrderPayments(providerOrderId)
  const right = (p: RazorpayPayment) => p.amount === payment.amountPaise && p.currency === 'INR' && p.order_id === providerOrderId

  let captured = remote.find((p) => p.status === 'captured' && right(p))
  if (!captured) {
    const authorized = remote.find((p) => p.status === 'authorized' && right(p))
    // Auto-capture is normally on in the Razorpay dashboard; if it is not,
    // capture here so the money is not refunded automatically later.
    if (authorized) {
      const result = await gateway.capturePayment(authorized.id, payment.amountPaise)
      if (result.status === 'captured' && right(result)) captured = result
    }
  }

  if (captured) {
    await markPaid(payment.id, payment.orderId, captured)
    return 'PAID'
  }
  if (remote.some((p) => p.status === 'captured')) {
    // Money arrived but not for the amount we expected. Never treat that as paid.
    await db.order.update({
      where: { id: payment.orderId },
      data: { adminNote: `Razorpay order ${providerOrderId} has a captured payment with an unexpected amount. Check before shipping.` },
    })
    return 'MISMATCH'
  }
  return remote.length > 0 && remote.every((p) => p.status === 'failed') ? 'FAILED' : 'PENDING'
}

async function markPaid(paymentId: string, orderId: string, captured: RazorpayPayment) {
  await db.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        providerPaymentId: captured.id,
        rawSummary: { id: captured.id, status: captured.status, amount: captured.amount, method: captured.method ?? null },
      },
    })
    if (updated.count === 0) return // already recorded by another path

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    if (order.status === 'PENDING') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED', paymentStatus: 'PAID', confirmedAt: new Date() } })
    } else {
      // e.g. the order was cancelled for non-payment and the payment landed later.
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'PAID',
          adminNote: `Payment ${captured.id} was captured after the order was ${order.status.toLowerCase()}. Refund it or reinstate the order.`,
        },
      })
    }
  })
}

// ---------------------------------------------------------------- checkout

export type CheckoutCallback = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

export async function confirmCheckoutPayment(
  orderId: string,
  cb: CheckoutCallback,
  gateway: RazorpayGateway,
  keySecret: string,
): Promise<PaymentState | 'BAD_SIGNATURE'> {
  // Our own record of the Razorpay order, looked up by our order id.
  const ours = await db.payment.findFirst({
    where: { orderId, provider: 'razorpay', providerOrderId: cb.razorpay_order_id },
    select: { providerOrderId: true },
  })
  if (!ours?.providerOrderId) return 'BAD_SIGNATURE'
  if (!verifyCheckoutSignature(ours.providerOrderId, cb.razorpay_payment_id, cb.razorpay_signature, keySecret)) return 'BAD_SIGNATURE'
  return reconcileRazorpayOrder(ours.providerOrderId, gateway)
}

// ----------------------------------------------------------------- webhook

export type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'BAD_SIGNATURE'

const HANDLED = new Set(['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid'])

export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  eventId: string | null,
  webhookSecret: string,
  gateway: RazorpayGateway,
): Promise<WebhookOutcome> {
  if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) return 'BAD_SIGNATURE'

  let body: {
    event?: string
    payload?: { payment?: { entity?: { order_id?: string | null } }; order?: { entity?: { id?: string } }; refund?: { entity?: { id?: string; status?: string } } }
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return 'IGNORED'
  }
  const eventType = String(body.event ?? 'unknown')
  const providerEventId = eventId ?? `${eventType}:${body.payload?.refund?.entity?.id ?? body.payload?.payment?.entity?.order_id ?? 'none'}`

  // One row per Razorpay event. A redelivered event that was already
  // handled is acknowledged without doing anything twice.
  const existing = await db.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: 'razorpay', providerEventId } } })
  if (existing && (existing.status === 'PROCESSED' || existing.status === 'IGNORED')) return 'DUPLICATE'
  const event =
    existing ??
    (await db.webhookEvent
      .create({ data: { provider: 'razorpay', providerEventId, eventType, signatureValid: true, payload: body as Prisma.InputJsonValue } })
      .catch(async () => db.webhookEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: 'razorpay', providerEventId } } })))

  const refund = body.payload?.refund?.entity
  if ((eventType === 'refund.processed' || eventType === 'refund.failed') && refund?.id && refund.status) {
    try {
      const applied = await applyRefundWebhook(refund.id, refund.status)
      await db.webhookEvent.update({ where: { id: event.id }, data: { status: applied ? 'PROCESSED' : 'IGNORED', processedAt: new Date(), error: null } })
      return applied ? 'PROCESSED' : 'IGNORED'
    } catch (e) {
      await db.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: String(e).slice(0, 500) } })
      throw e
    }
  }

  const providerOrderId = body.payload?.payment?.entity?.order_id ?? body.payload?.order?.entity?.id ?? null
  if (!HANDLED.has(eventType) || !providerOrderId) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: 'IGNORED', processedAt: new Date() } })
    return 'IGNORED'
  }

  try {
    await reconcileRazorpayOrder(providerOrderId, gateway)
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), error: null } })
    return 'PROCESSED'
  } catch (e) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: String(e).slice(0, 500) } })
    throw e // a 5xx makes Razorpay retry later
  }
}

// --------------------------------------------------- unpaid order clean-up

/** Gives back reserved stock and coupon use for an order that will not ship. */
export async function releaseOrderReservations(tx: Tx, orderId: string, note: string) {
  const reserved = await tx.inventoryMovement.groupBy({
    by: ['inventoryId'],
    where: { orderId, reason: { in: ['RESERVATION', 'RELEASE'] } },
    _sum: { delta: true },
  })
  for (const r of reserved) {
    const qty = r._sum.delta ?? 0
    if (qty <= 0) continue
    await tx.inventory.update({ where: { id: r.inventoryId }, data: { reserved: { decrement: qty } } })
    await tx.inventoryMovement.create({ data: { inventoryId: r.inventoryId, delta: -qty, reason: 'RELEASE', orderId, note } })
  }
  const usage = await tx.couponUsage.findUnique({ where: { orderId }, select: { id: true, couponId: true } })
  if (usage) {
    await tx.couponUsage.delete({ where: { id: usage.id } })
    await tx.coupon.update({ where: { id: usage.couponId }, data: { timesUsed: { decrement: 1 } } })
  }
}

/**
 * Cancels online orders left unpaid for UNPAID_ORDER_MINUTES and frees their
 * stock. Each order is first re-checked with Razorpay, so a payment that
 * succeeded but whose notification was lost is recorded, not cancelled.
 */
export async function releaseUnpaidOrders(gateway: RazorpayGateway | null, now = new Date()): Promise<{ cancelled: number; paid: number }> {
  const cutoff = new Date(now.getTime() - UNPAID_ORDER_MINUTES * 60_000)
  const stale = await db.order.findMany({
    where: { paymentMethod: 'RAZORPAY', status: 'PENDING', paymentStatus: 'PENDING', placedAt: { lt: cutoff } },
    select: { id: true, payments: { where: { providerOrderId: { not: null } }, select: { providerOrderId: true } } },
    take: 100,
  })

  let cancelled = 0
  let paid = 0
  for (const order of stale) {
    if (gateway) {
      let isPaid = false
      for (const p of order.payments) {
        if ((await reconcileRazorpayOrder(p.providerOrderId!, gateway)) === 'PAID') isPaid = true
      }
      if (isPaid) {
        paid++
        continue
      }
    }
    const done = await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING', paymentStatus: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: `Payment not completed within ${UNPAID_ORDER_MINUTES} minutes` },
      })
      if (count === 0) return false
      await releaseOrderReservations(tx, order.id, 'Released: order not paid')
      await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'Not paid in time' } })
      return true
    })
    if (done) cancelled++
  }
  return { cancelled, paid }
}
