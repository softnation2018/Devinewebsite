import { db } from '../db'

const IST_OFFSET_MS = 330 * 60_000

/** Midnight today in India, as a UTC instant. */
export function startOfTodayIST(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  ist.setUTCHours(0, 0, 0, 0)
  return new Date(ist.getTime() - IST_OFFSET_MS)
}

export async function getDashboard(now = new Date()) {
  const today = startOfTodayIST(now)
  const [ordersToday, paidToday, toPack, awaitingPayment, codOpen, decisions, lowStock] = await Promise.all([
    db.order.count({ where: { placedAt: { gte: today } } }),
    // Only money actually received: paid online orders. COD counts once collected (courier milestone).
    db.order.aggregate({ where: { placedAt: { gte: today }, paymentStatus: 'PAID' }, _sum: { totalPaise: true } }),
    db.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING'] } } }),
    db.order.count({ where: { status: 'PENDING' } }),
    db.order.count({ where: { paymentMethod: 'COD', paymentStatus: 'PENDING', status: { notIn: ['CANCELLED', 'RETURNED'] } } }),
    db.storeSetting.count({ where: { needsOwnerDecision: true } }),
    db.$queryRaw<{ id: string; name: string; sku: string; available: number; threshold: number }[]>`
      SELECT p.id, p.name, p.sku, (i."onHand" - i.reserved)::int AS available, p."lowStockThreshold" AS threshold
      FROM "Product" p JOIN "Inventory" i ON i."productId" = p.id
      WHERE p.status = 'PUBLISHED' AND (i."onHand" - i.reserved) <= p."lowStockThreshold"
      ORDER BY available ASC, p.name ASC
      LIMIT 20`,
  ])
  return {
    ordersToday,
    paidTodayPaise: paidToday._sum.totalPaise ?? 0,
    toPack,
    awaitingPayment,
    codOpen,
    decisions,
    lowStock,
  }
}
