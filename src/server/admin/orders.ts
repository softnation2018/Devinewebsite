// Order management for staff. Every change is written together with an
// audit-log row, and status changes follow an explicit list of allowed moves.

import type { OrderStatus, Prisma } from '@/generated/prisma/client'
import { db } from '../db'
import { releaseOrderReservations } from '../payments/online'
import { queueCustomerEmail } from '../notifications'
import { recordAudit } from './audit'

const PAGE_SIZE = 25

export async function listOrders(opts: { status?: OrderStatus; q?: string; page?: number }) {
  const q = opts.q?.trim().slice(0, 100)
  const where: Prisma.OrderWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { guestEmail: { contains: q, mode: 'insensitive' } },
            { guestPhone: { contains: q } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const page = Math.max(1, opts.page ?? 1)
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        deliverySpeed: true,
        totalPaise: true,
        placedAt: true,
        guestEmail: true,
        user: { select: { email: true } },
        _count: { select: { items: true } },
      },
    }),
  ])
  return { orders, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function getOrderForStaff(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: { orderBy: { createdAt: 'asc' } },
      user: { select: { email: true, name: true } },
      movements: { orderBy: { createdAt: 'asc' }, select: { delta: true, reason: true, note: true, createdAt: true } },
    },
  })
}

/** Moves staff may make by hand. Shipping and delivery come from the courier integration. */
const MANUAL_MOVES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  CONFIRMED: ['PROCESSING'],
  PROCESSING: ['CONFIRMED'],
}

export type StaffResult = { ok: true } | { ok: false; error: string }

export async function setOrderStatus(orderId: string, to: OrderStatus, actor: { id: string; ip: string | null }): Promise<StaffResult> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
    if (!order) return { ok: false, error: 'Order not found.' }
    if (!MANUAL_MOVES[order.status]?.includes(to)) {
      return { ok: false, error: `An order cannot be moved from ${order.status} to ${to} here.` }
    }
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to } })
    if (count === 0) return { ok: false, error: 'The order changed meanwhile. Reload and try again.' }
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'order.status', entityType: 'Order', entityId: orderId, before: { status: order.status }, after: { status: to } })
    return { ok: true }
  })
}

const CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING']

/**
 * Cancels an order that has not shipped and gives its stock back. A paid
 * order is left marked paid with a note: the refund is a separate, deliberate
 * step and is never implied by cancelling.
 */
export async function cancelOrder(orderId: string, reason: string, actor: { id: string; ip: string | null }): Promise<StaffResult> {
  const why = reason.trim().slice(0, 300)
  if (!why) return { ok: false, error: 'Please give a reason.' }
  return db.$transaction((tx) => cancelOrderInTx(tx, orderId, CANCELLABLE, why, { id: actor.id, ip: actor.ip, by: 'staff' }))
}

/** Shared by staff and customer cancellation. `allowed` lists the statuses this caller may cancel from. */
export async function cancelOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  allowed: OrderStatus[],
  why: string,
  actor: { id: string | null; ip: string | null; by: 'staff' | 'customer' },
): Promise<StaffResult> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, paymentStatus: true, adminNote: true } })
  if (!order) return { ok: false, error: 'Order not found.' }
  if (!allowed.includes(order.status)) return { ok: false, error: `A ${order.status.toLowerCase()} order cannot be cancelled here.` }
  const shipment = await tx.shipment.findFirst({ where: { orderId, status: { notIn: ['CANCELLED', 'FAILED'] } }, select: { id: true } })
  if (shipment) return { ok: false, error: actor.by === 'staff' ? 'This order has a courier booking. Cancel the shipment first.' : 'This order has already been handed to the courier.' }

  const paid = order.paymentStatus === 'PAID'
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: actor.by === 'customer' ? `Cancelled by customer: ${why}` : why,
      ...(paid ? { adminNote: [order.adminNote, 'Cancelled after payment: refund still to be issued.'].filter(Boolean).join('\n') } : {}),
    },
  })
  if (count === 0) return { ok: false, error: 'The order changed meanwhile. Reload and try again.' }
  await releaseOrderReservations(tx, orderId, `Released: cancelled by ${actor.by} (${why.slice(0, 80)})`)
  await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'FAILED', failureReason: 'Order cancelled' } })
  await recordAudit(tx, {
    actorUserId: actor.id,
    ipAddress: actor.ip,
    action: actor.by === 'customer' ? 'order.cancel.customer' : 'order.cancel',
    entityType: 'Order',
    entityId: orderId,
    before: { status: order.status },
    after: { status: 'CANCELLED', reason: why },
  })
  // The customer already knows when they cancelled it themselves.
  if (actor.by === 'staff') await queueCustomerEmail(tx, { kind: 'order_cancelled', orderId })
  return { ok: true }
}

export async function setAdminNote(orderId: string, note: string, actor: { id: string; ip: string | null }): Promise<StaffResult> {
  const text = note.trim().slice(0, 2000)
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { adminNote: true } })
    if (!order) return { ok: false, error: 'Order not found.' }
    await tx.order.update({ where: { id: orderId }, data: { adminNote: text || null } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'order.note', entityType: 'Order', entityId: orderId, before: { adminNote: order.adminNote }, after: { adminNote: text || null } })
    return { ok: true }
  })
}
