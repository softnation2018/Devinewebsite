import { db } from './db'

/** What the account dashboard shows. Always scoped to the signed-in user's id. */
export async function getAccountOverview(userId: string) {
  const [orderCount, recentOrders, addresses] = await Promise.all([
    db.order.count({ where: { userId } }),
    db.order.findMany({
      where: { userId },
      orderBy: { placedAt: 'desc' },
      take: 5,
      select: { id: true, orderNumber: true, status: true, totalPaise: true, placedAt: true },
    }),
    db.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, fullName: true, line1: true, line2: true, city: true, state: true, pincode: true, isDefault: true },
    }),
  ])
  return { orderCount, recentOrders, addresses }
}
