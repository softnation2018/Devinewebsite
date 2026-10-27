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
      SELECT * FROM (
        -- Products sold without options use their own stock...
        SELECT p.id, p.name, p.sku, (i."onHand" - i.reserved)::int AS available, p."lowStockThreshold" AS threshold
        FROM "Product" p JOIN "Inventory" i ON i."productId" = p.id
        WHERE p.status = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v."isActive")
        UNION ALL
        -- ...products sold in options are listed option by option.
        SELECT p.id, p.name || ' (' || v.name || ')', v.sku, (i."onHand" - i.reserved)::int, p."lowStockThreshold"
        FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId" JOIN "Inventory" i ON i."variantId" = v.id
        WHERE p.status = 'PUBLISHED' AND v."isActive"
      ) s
      WHERE available <= threshold
      ORDER BY available ASC, name ASC
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
