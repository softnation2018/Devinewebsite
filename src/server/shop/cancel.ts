import 'server-only'
import type { OrderStatus } from '@/generated/prisma/client'
import { cancelOrderInTx } from '../admin/orders'
import { db } from '../db'
import { sendEmail } from '../email'
import { type CancellationRule, getSupportSettings } from '../settings'

// Customers cancelling their own order, within the rule the owner set in
// Admin → Settings. Unpaid online orders (PENDING) are not offered: they
// expire by themselves, and a payment might still be on its way.

export function customerCancellable(rule: CancellationRule): OrderStatus[] {
  if (rule === 'BEFORE_PROCESSING') return ['CONFIRMED']
  if (rule === 'BEFORE_SHIPMENT') return ['CONFIRMED', 'PROCESSING']
  return []
}

export async function cancelOwnOrder(
  orderId: string,
  rule: CancellationRule,
  reason: string,
  actor: { userId: string | null; ip: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const why = reason.trim().slice(0, 300) || 'No reason given'
  const allowed = customerCancellable(rule)
  if (allowed.length === 0) return { ok: false, error: 'Orders cannot be cancelled online. Please contact us.' }
  const r = await db.$transaction((tx) => cancelOrderInTx(tx, orderId, allowed, why, { id: actor.userId, ip: actor.ip, by: 'customer' }))
  if (!r.ok) return r

  const [order, support] = await Promise.all([
    db.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, paymentStatus: true } }),
    getSupportSettings(),
  ])
  if (order && support.email) {
    await sendEmail({
      to: support.email,
      subject: `Order ${order.orderNumber} cancelled by the customer`,
      text: `Order ${order.orderNumber} was cancelled by the customer.\nReason: ${why}\n${order.paymentStatus === 'PAID' ? '\nThis order was paid: issue the refund from Admin → Orders.\n' : ''}`,
    })
  }
  return { ok: true }
}
