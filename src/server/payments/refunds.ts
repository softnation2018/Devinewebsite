import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { recordAudit } from '../admin/audit'
import { db } from '../db'
import { RazorpayError, type RazorpayRefunds } from './razorpay'

// Refunds. Money only moves through Razorpay's refund API (online orders)
// or by staff by hand (COD orders, by UPI or bank transfer). A refund is
// counted as done only when Razorpay says "processed", or when staff record
// the transfer's reference number. A refund row is written BEFORE Razorpay
// is asked, and the amount is checked under a lock, so two clicks can never
// refund more than was paid.

type Tx = Prisma.TransactionClient
type Actor = { id: string; ip: string | null }
export type RefundResult = { ok: true; message: string } | { ok: false; error: string }

const PAID_STATES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const
export const MANUAL_METHODS = ['upi', 'bank_transfer'] as const
export type ManualMethod = (typeof MANUAL_METHODS)[number]

async function money(tx: Tx | typeof db, orderId: string) {
  const [paid, refunds] = await Promise.all([
    tx.payment.aggregate({ where: { orderId, status: { in: [...PAID_STATES] } }, _sum: { amountPaise: true } }),
    tx.refund.groupBy({ by: ['status'], where: { orderId }, _sum: { amountPaise: true } }),
  ])
  const sum = (s: string[]) => refunds.filter((r) => s.includes(r.status)).reduce((a, r) => a + (r._sum.amountPaise ?? 0), 0)
  const paidPaise = paid._sum.amountPaise ?? 0
  const completedPaise = sum(['COMPLETED'])
  const inProgressPaise = sum(['REQUESTED', 'PROCESSING'])
  return { paidPaise, completedPaise, inProgressPaise, availablePaise: Math.max(0, paidPaise - completedPaise - inProgressPaise) }
}

/** What staff see on the order page. */
export async function getRefundPanel(orderId: string) {
  const [summary, refunds] = await Promise.all([
    money(db, orderId),
    db.refund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountPaise: true, reason: true, status: true, method: true, providerRefundId: true, createdAt: true, completedAt: true },
    }),
  ])
  return { ...summary, refunds }
}

/** Keeps the payment and order status in step with completed refunds. */
async function settleStatus(tx: Tx, orderId: string) {
  const { paidPaise, completedPaise } = await money(tx, orderId)
  if (paidPaise === 0) return
  const status = completedPaise >= paidPaise ? 'REFUNDED' : completedPaise > 0 ? 'PARTIALLY_REFUNDED' : 'PAID'
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status } })
  await tx.payment.updateMany({ where: { orderId, status: { in: [...PAID_STATES] } }, data: { status } })
}

async function lockAndCheck(tx: Tx, orderId: string, amountPaise: number) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { paymentMethod: true, paymentStatus: true, orderNumber: true } })
  if (!order) return { error: 'Order not found.' } as const
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) return { error: 'Only a paid order can be refunded.' } as const
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) return { error: 'Enter an amount above zero.' } as const
  const { availablePaise } = await money(tx, orderId)
  if (amountPaise > availablePaise) return { error: `At most ${formatPaise(availablePaise)} can still be refunded on this order.` } as const
  return { order } as const
}

/** Online orders: asks Razorpay to refund part or all of the captured payment. */
export async function refundViaRazorpay(orderId: string, amountPaise: number, reason: string, actor: Actor, gateway: RazorpayRefunds): Promise<RefundResult> {
  const why = reason.trim().slice(0, 300)
  if (!why) return { ok: false, error: 'Please give a reason.' }

  type Prepared = { error: string } | { refundId: string; providerPaymentId: string; orderNumber: string }
  const prepared = await db.$transaction(async (tx): Promise<Prepared> => {
    const checked = await lockAndCheck(tx, orderId, amountPaise)
    if (checked.error !== undefined) return { error: checked.error }
    if (checked.order.paymentMethod !== 'RAZORPAY') return { error: 'This is a COD order. Refund it by UPI or bank transfer and record the reference.' }
    const payment = await tx.payment.findFirst({
      where: { orderId, provider: 'razorpay', providerPaymentId: { not: null }, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, providerPaymentId: true },
    })
    if (!payment) return { error: 'No captured Razorpay payment found for this order.' }
    const refund = await tx.refund.create({
      data: { orderId, paymentId: payment.id, amountPaise, reason: why, status: 'PROCESSING', method: 'razorpay', initiatedByUserId: actor.id },
      select: { id: true },
    })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'refund.start', entityType: 'Order', entityId: orderId, after: { refundId: refund.id, amountPaise, method: 'razorpay', reason: why } })
    return { refundId: refund.id, providerPaymentId: payment.providerPaymentId!, orderNumber: checked.order.orderNumber }
  })
  if ('error' in prepared) return { ok: false, error: prepared.error }

  try {
    const r = await gateway.refundPayment(prepared.providerPaymentId, amountPaise, { refund_ref: prepared.refundId, order: prepared.orderNumber })
    await db.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: prepared.refundId },
        data: { providerRefundId: r.id, ...(r.status === 'processed' ? { status: 'COMPLETED', completedAt: new Date() } : r.status === 'failed' ? { status: 'FAILED' } : {}) },
      })
      await settleStatus(tx, orderId)
    })
    if (r.status === 'failed') return { ok: false, error: 'Razorpay could not process this refund.' }
    return { ok: true, message: r.status === 'processed' ? 'Refunded through Razorpay.' : 'Razorpay accepted the refund. It is marked done when Razorpay confirms it.' }
  } catch (e) {
    if (e instanceof RazorpayError && e.status && e.status >= 400 && e.status < 500) {
      // Razorpay refused the request, so no money moved.
      await db.refund.update({ where: { id: prepared.refundId }, data: { status: 'FAILED' } })
      return { ok: false, error: 'Razorpay refused this refund. Check the amount and the payment in your Razorpay dashboard.' }
    }
    // No clear answer: the refund may or may not exist at Razorpay. It stays
    // "in progress" and is NOT retried automatically.
    return { ok: false, error: 'No answer from Razorpay. Do not try again yet: check the payment in your Razorpay dashboard, then record what happened below.' }
  }
}

/** COD orders (or money returned outside Razorpay): staff record a transfer they made. */
export async function recordManualRefund(
  orderId: string,
  amountPaise: number,
  method: ManualMethod,
  reference: string,
  reason: string,
  actor: Actor,
): Promise<RefundResult> {
  const why = reason.trim().slice(0, 300)
  const ref = reference.trim()
  if (!why) return { ok: false, error: 'Please give a reason.' }
  if (!/^[A-Za-z0-9-]{6,40}$/.test(ref)) return { ok: false, error: 'Enter the UPI or bank reference number (6 to 40 letters or digits).' }
  return db.$transaction(async (tx) => {
    const checked = await lockAndCheck(tx, orderId, amountPaise)
    if (checked.error !== undefined) return { ok: false as const, error: checked.error }
    if (checked.order.paymentMethod === 'RAZORPAY') return { ok: false as const, error: 'This order was paid through Razorpay. Refund it through Razorpay.' }
    const providerRefundId = `${method}:${ref}`
    if (await tx.refund.findUnique({ where: { providerRefundId }, select: { id: true } })) return { ok: false as const, error: 'This reference number is already recorded.' }
    const refund = await tx.refund.create({
      data: { orderId, amountPaise, reason: why, status: 'COMPLETED', completedAt: new Date(), method, providerRefundId, initiatedByUserId: actor.id },
      select: { id: true },
    })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'refund.manual', entityType: 'Order', entityId: orderId, after: { refundId: refund.id, amountPaise, method, reference: ref, reason: why } })
    await settleStatus(tx, orderId)
    return { ok: true as const, message: 'Refund recorded.' }
  })
}

/**
 * For a Razorpay refund that got no clear answer: staff checked the Razorpay
 * dashboard and record what they found. "Done" needs Razorpay's refund id.
 */
export async function resolveStuckRefund(refundId: string, outcome: 'COMPLETED' | 'FAILED', providerRefundId: string, actor: Actor): Promise<RefundResult> {
  const rid = providerRefundId.trim()
  if (outcome === 'COMPLETED' && !/^rfnd_[A-Za-z0-9]{6,30}$/.test(rid)) return { ok: false, error: 'Enter the Razorpay refund id (starts with rfnd_).' }
  return db.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, select: { orderId: true, status: true, method: true, providerRefundId: true } })
    if (!refund || refund.method !== 'razorpay' || refund.status !== 'PROCESSING') return { ok: false as const, error: 'This refund is not waiting for an answer.' }
    if (refund.providerRefundId && outcome === 'COMPLETED' && refund.providerRefundId !== rid) return { ok: false as const, error: 'That is not the refund id Razorpay gave for this refund.' }
    await tx.refund.update({
      where: { id: refundId },
      data: outcome === 'COMPLETED' ? { status: 'COMPLETED', completedAt: new Date(), providerRefundId: rid } : { status: 'FAILED' },
    })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'refund.resolve', entityType: 'Order', entityId: refund.orderId, after: { refundId, outcome, providerRefundId: rid || null } })
    await settleStatus(tx, refund.orderId)
    return { ok: true as const, message: outcome === 'COMPLETED' ? 'Marked as refunded.' : 'Marked as not refunded.' }
  })
}

/** Razorpay webhook refund.processed / refund.failed. Unknown refund ids are ignored. */
export async function applyRefundWebhook(providerRefundId: string, status: string): Promise<boolean> {
  if (status !== 'processed' && status !== 'failed') return false
  return db.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { providerRefundId }, select: { id: true, orderId: true, status: true } })
    if (!refund || refund.status === 'COMPLETED' || refund.status === 'FAILED') return false
    await tx.refund.update({ where: { id: refund.id }, data: status === 'processed' ? { status: 'COMPLETED', completedAt: new Date() } : { status: 'FAILED' } })
    await settleStatus(tx, refund.orderId)
    return true
  })
}
