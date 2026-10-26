import { afterAll, describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { db } from '../db'
import type { CommerceSettings } from '../settings'
import { addToCart, createCart } from '../shop/cart'
import { placeOrder } from '../shop/checkout'
import { cancelOrder, setAdminNote, setOrderStatus } from './orders'
import { saveSetting } from './settings'

const tag = `it-adm-${Date.now()}`
let n = 0
const settings: CommerceSettings = { shippingFlatPaise: 0, shippingFreeAbovePaise: null, codEnabled: true, codFeePaise: 0, codMinOrderPaise: 0, codMaxOrderPaise: 0 }

async function actor() {
  const u = await db.user.create({ data: { email: `${tag}-${++n}@example.test`, role: 'ADMIN' } })
  return { id: u.id, ip: '127.0.0.1' }
}

async function codOrder(couponCode: string | null = null) {
  n++
  const p = await db.product.create({
    data: { sku: `${tag}-${n}`, slug: `${tag}-${n}`, name: 'Admin test', pricePaise: 20_000, status: 'PUBLISHED', inventory: { create: { onHand: 5 } } },
    select: { id: true, inventory: { select: { id: true } } },
  })
  const cart = await createCart(null)
  await addToCart(cart.id, p.id, null, 2)
  const r = await placeOrder(
    { cartId: cart.id, userId: null, email: `${tag}-g${n}@example.test`, address: { fullName: 'A', phone: '9876543210', line1: 'x', line2: null, landmark: null, city: 'Pune', state: 'Maharashtra', pincode: '411001' }, paymentMethod: 'COD', couponCode, customerNote: null, saveAddress: false },
    settings,
    false,
  )
  if (!r.ok) throw new Error(r.message)
  return { orderId: r.orderId, inventoryId: p.inventory!.id }
}

afterAll(async () => {
  await db.order.deleteMany({ where: { guestEmail: { startsWith: tag } } })
  await db.cart.deleteMany({ where: { items: { some: { product: { sku: { startsWith: tag } } } } } })
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.coupon.deleteMany({ where: { code: { startsWith: tag.toUpperCase() } } })
  await db.auditLog.deleteMany({ where: { actor: { email: { startsWith: tag } } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('order status by staff', () => {
  it('allows only the listed moves and records each in the audit log', async () => {
    const a = await actor()
    const { orderId } = await codOrder()
    expect(await setOrderStatus(orderId, 'PROCESSING', a)).toEqual({ ok: true })
    expect(await setOrderStatus(orderId, 'DELIVERED', a)).toMatchObject({ ok: false })
    expect(await setOrderStatus(orderId, 'SHIPPED', a)).toMatchObject({ ok: false })
    const log = await db.auditLog.findMany({ where: { entityId: orderId, action: 'order.status' } })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ actorUserId: a.id, before: { status: 'CONFIRMED' }, after: { status: 'PROCESSING' } })
  })
})

describe('cancelling', () => {
  it('releases stock and coupon use, fails the pending COD payment, and is audited', async () => {
    const a = await actor()
    const coupon = await db.coupon.create({ data: { code: `${tag.toUpperCase()}-X`, type: 'FIXED', valuePaise: 1_000 } })
    const { orderId, inventoryId } = await codOrder(coupon.code)
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).reserved).toBe(2)

    expect(await cancelOrder(orderId, '', a)).toMatchObject({ ok: false })
    expect(await cancelOrder(orderId, 'Customer asked by phone', a)).toEqual({ ok: true })

    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } })
    expect(o).toMatchObject({ status: 'CANCELLED', cancelReason: 'Customer asked by phone' })
    expect(o.payments[0].status).toBe('FAILED')
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).reserved).toBe(0)
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).timesUsed).toBe(0)
    expect(await db.auditLog.count({ where: { entityId: orderId, action: 'order.cancel' } })).toBe(1)

    // A second cancel is refused and releases nothing twice.
    expect(await cancelOrder(orderId, 'again', a)).toMatchObject({ ok: false })
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).reserved).toBe(0)
  })

  it('a paid order stays marked paid with a refund reminder', async () => {
    const a = await actor()
    const { orderId } = await codOrder()
    await db.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } })
    expect(await cancelOrder(orderId, 'Out of stock at warehouse', a)).toEqual({ ok: true })
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } })
    expect(o.paymentStatus).toBe('PAID')
    expect(o.adminNote).toMatch(/refund still to be issued/)
  })

  it('cannot cancel a shipped order here', async () => {
    const a = await actor()
    const { orderId } = await codOrder()
    await db.order.update({ where: { id: orderId }, data: { status: 'SHIPPED' } })
    expect(await cancelOrder(orderId, 'late', a)).toMatchObject({ ok: false })
  })
})

describe('notes and settings', () => {
  it('saves a staff note with before/after in the audit log', async () => {
    const a = await actor()
    const { orderId } = await codOrder()
    await setAdminNote(orderId, 'Gift wrap', a)
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: orderId, action: 'order.note' } })
    expect(log.after).toEqual({ adminNote: 'Gift wrap' })
  })

  it('saving a setting stores it, clears the placeholder flag, and is audited', async () => {
    const a = await actor()
    const key = 'shipping.freeAbovePaise'
    // CI runs these tests before the seed, so create the row if it is missing.
    const original = await db.storeSetting.findUnique({ where: { key } })
    if (!original) {
      await db.storeSetting.create({ data: { key, value: 99_900, needsOwnerDecision: true } })
    }
    try {
      await saveSetting(key, null, a)
      const row = await db.storeSetting.findUniqueOrThrow({ where: { key } })
      expect(row.value).toBeNull()
      expect(row.needsOwnerDecision).toBe(false)
      expect(await db.auditLog.count({ where: { entityId: key, actorUserId: a.id } })).toBe(1)
    } finally {
      if (original) {
        await db.storeSetting.update({ where: { key }, data: { value: original.value === null ? Prisma.JsonNull : original.value, needsOwnerDecision: original.needsOwnerDecision } })
      } else {
        await db.storeSetting.delete({ where: { key } })
      }
    }
  })
})
