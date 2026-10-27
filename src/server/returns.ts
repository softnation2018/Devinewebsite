import 'server-only'
import type { Prisma, ReturnStatus } from '@/generated/prisma/client'
import { recordAudit } from './admin/audit'
import { db } from './db'

// Returns. The customer asks; staff approve or decline, arrange the pickup
// and record when the parcel arrives. Money goes back only through the
// separate refund step, so receiving a return never pays anyone by itself.

export const RETURN_REASONS = {
  DAMAGED: 'Arrived damaged',
  WRONG_ITEM: 'Wrong item received',
  NOT_AS_DESCRIBED: 'Not as described',
  CHANGED_MIND: 'No longer needed',
  OTHER: 'Other',
} as const
export type ReturnReason = keyof typeof RETURN_REASONS

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  PICKUP_SCHEDULED: 'Pickup arranged',
  IN_TRANSIT: 'On its way back',
  RECEIVED: 'Received',
  REFUNDED: 'Refunded',
  CLOSED: 'Closed',
}

const OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'IN_TRANSIT']

export type ReturnLine = { orderItemId: string; quantity: number }
type Actor = { id: string; ip: string | null }
type Result = { ok: true } | { ok: false; error: string }

/** Items the customer can still ask to return, or why none can. */
export async function returnableItems(orderId: string, windowDays: number, now = new Date()) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      deliveredAt: true,
      items: { select: { id: true, nameSnapshot: true, quantity: true, product: { select: { returnEligible: true } } } },
      returns: { select: { status: true, itemsJson: true } },
    },
  })
  if (!order || order.status !== 'DELIVERED' || !order.deliveredAt || windowDays <= 0) return { items: [], reason: null as string | null }
  const lastDay = new Date(order.deliveredAt.getTime() + windowDays * 86_400_000)
  if (now > lastDay) return { items: [], reason: `Returns could be requested until ${lastDay.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.` }
  if (order.returns.some((r) => OPEN.includes(r.status))) return { items: [], reason: 'A return request for this order is already open.' }

  const already = new Map<string, number>()
  for (const r of order.returns) {
    if (r.status === 'REJECTED') continue
    for (const l of r.itemsJson as ReturnLine[]) already.set(l.orderItemId, (already.get(l.orderItemId) ?? 0) + l.quantity)
  }
  const items = order.items
    .filter((i) => i.product?.returnEligible !== false)
    .map((i) => ({ id: i.id, name: i.nameSnapshot, maxQuantity: i.quantity - (already.get(i.id) ?? 0) }))
    .filter((i) => i.maxQuantity > 0)
  return { items, reason: items.length === 0 ? 'None of the items in this order can be returned.' : null }
}

export async function requestReturn(
  orderId: string,
  windowDays: number,
  input: { lines: ReturnLine[]; reason: ReturnReason; note: string },
  actor: { userId: string | null; ip: string | null },
): Promise<Result> {
  const { items, reason } = await returnableItems(orderId, windowDays)
  if (items.length === 0) return { ok: false, error: reason ?? 'This order cannot be returned online. Please contact us.' }
  const lines = input.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) return { ok: false, error: 'Choose at least one item to return.' }
  for (const l of lines) {
    const item = items.find((i) => i.id === l.orderItemId)
    if (!item || !Number.isInteger(l.quantity) || l.quantity > item.maxQuantity) return { ok: false, error: 'One of the quantities is not possible.' }
  }
  if (!(input.reason in RETURN_REASONS)) return { ok: false, error: 'Choose a reason.' }
  const note = input.note.trim().slice(0, 1000)
  if (input.reason === 'OTHER' && !note) return { ok: false, error: 'Please tell us a little about the reason.' }

  return db.$transaction(async (tx) => {
    // One open request per order, even if two are sent at once.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    if (await tx.return.findFirst({ where: { orderId, status: { in: OPEN } }, select: { id: true } })) return { ok: false as const, error: 'A return request for this order is already open.' }
    const r = await tx.return.create({
      data: { orderId, reason: input.reason, customerNote: note || null, itemsJson: lines as unknown as Prisma.InputJsonValue },
      select: { id: true },
    })
    await recordAudit(tx, { actorUserId: actor.userId, ipAddress: actor.ip, action: 'return.request', entityType: 'Order', entityId: orderId, after: { returnId: r.id, reason: input.reason, lines } })
    return { ok: true as const }
  })
}

// ------------------------------------------------------------------ staff

const MOVES: Record<string, ReturnStatus[]> = {
  APPROVE: ['REQUESTED'],
  REJECT: ['REQUESTED'],
  PICKUP: ['APPROVED'],
  RECEIVE: ['APPROVED', 'PICKUP_SCHEDULED', 'IN_TRANSIT'],
  CLOSE: ['RECEIVED', 'REFUNDED'],
}
export type ReturnMove = keyof typeof MOVES

export async function moveReturn(
  returnId: string,
  move: ReturnMove,
  opts: { note: string; awbNumber: string; restock: boolean },
  actor: Actor,
): Promise<Result> {
  const note = opts.note.trim().slice(0, 1000)
  const awb = opts.awbNumber.trim().slice(0, 60)
  if (move === 'REJECT' && !note) return { ok: false, error: 'Please say why, so the customer can be told.' }
  if (move === 'PICKUP' && !awb) return { ok: false, error: 'Enter the return parcel’s tracking (AWB) number.' }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`
    const ret = await tx.return.findUnique({ where: { id: returnId }, select: { id: true, orderId: true, status: true, itemsJson: true, adminNote: true } })
    if (!ret) return { ok: false as const, error: 'Return not found.' }
    if (!MOVES[move].includes(ret.status)) return { ok: false as const, error: `A return that is “${RETURN_STATUS_LABEL[ret.status]}” cannot be changed that way.` }

    const to: ReturnStatus = { APPROVE: 'APPROVED', REJECT: 'REJECTED', PICKUP: 'PICKUP_SCHEDULED', RECEIVE: 'RECEIVED', CLOSE: 'CLOSED' }[move] as ReturnStatus
    await tx.return.update({
      where: { id: returnId },
      data: {
        status: to,
        ...(note ? { adminNote: [ret.adminNote, note].filter(Boolean).join('\n') } : {}),
        ...(awb ? { awbNumber: awb } : {}),
        ...(to === 'REJECTED' || to === 'CLOSED' ? { resolvedAt: new Date() } : {}),
      },
    })

    if (move === 'RECEIVE') {
      const lines = ret.itemsJson as ReturnLine[]
      if (opts.restock) {
        const items = await tx.orderItem.findMany({ where: { id: { in: lines.map((l) => l.orderItemId) } }, select: { id: true, productId: true } })
        for (const l of lines) {
          const productId = items.find((i) => i.id === l.orderItemId)?.productId
          const inv = productId ? await tx.inventory.findUnique({ where: { productId }, select: { id: true } }) : null
          if (!inv) continue
          await tx.inventory.update({ where: { id: inv.id }, data: { onHand: { increment: l.quantity } } })
          await tx.inventoryMovement.create({ data: { inventoryId: inv.id, delta: l.quantity, reason: 'RETURN', orderId: ret.orderId, actorUserId: actor.id, note: 'Return received in sellable condition' } })
        }
      }
      // Everything in the order is back: mark the order returned.
      const [ordered, returned] = await Promise.all([
        tx.orderItem.aggregate({ where: { orderId: ret.orderId }, _sum: { quantity: true } }),
        tx.return.findMany({ where: { orderId: ret.orderId, status: { in: ['RECEIVED', 'REFUNDED', 'CLOSED'] } }, select: { itemsJson: true } }),
      ])
      const back = returned.flatMap((r) => r.itemsJson as ReturnLine[]).reduce((a, l) => a + l.quantity, 0)
      if (back >= (ordered._sum.quantity ?? 0)) await tx.order.update({ where: { id: ret.orderId }, data: { status: 'RETURNED' } })
    }

    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: `return.${move.toLowerCase()}`,
      entityType: 'Order',
      entityId: ret.orderId,
      before: { returnId, status: ret.status },
      after: { status: to, ...(note ? { note } : {}), ...(awb ? { awbNumber: awb } : {}), ...(move === 'RECEIVE' ? { restocked: opts.restock } : {}) },
    })
    return { ok: true as const }
  })
}

export async function listReturnsForStaff(open: boolean) {
  return db.return.findMany({
    where: open ? { status: { in: [...OPEN, 'RECEIVED'] } } : {},
    orderBy: { requestedAt: open ? 'asc' : 'desc' },
    take: 100,
    select: { id: true, status: true, reason: true, requestedAt: true, order: { select: { id: true, orderNumber: true } } },
  })
}

export async function returnsForOrder(orderId: string) {
  const [returns, items] = await Promise.all([
    db.return.findMany({ where: { orderId }, orderBy: { requestedAt: 'desc' } }),
    db.orderItem.findMany({ where: { orderId }, select: { id: true, nameSnapshot: true } }),
  ])
  const name = new Map(items.map((i) => [i.id, i.nameSnapshot]))
  return returns.map((r) => ({
    ...r,
    lines: (r.itemsJson as ReturnLine[]).map((l) => ({ ...l, name: name.get(l.orderItemId) ?? 'Item' })),
    reasonLabel: RETURN_REASONS[r.reason as ReturnReason] ?? r.reason,
  }))
}
