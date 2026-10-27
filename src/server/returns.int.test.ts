import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db'
import { moveReturn, requestReturn, returnableItems } from './returns'

const tag = `it-ret-${Date.now()}`
let n = 0
let staff: { id: string; ip: string }
let goodProduct: string, finalSale: string, inventoryId: string

async function deliveredOrder(daysAgo = 2) {
  n++
  return db.order.create({
    data: {
      orderNumber: `${tag}-${n}`,
      status: 'DELIVERED',
      deliveredAt: new Date(Date.now() - daysAgo * 86_400_000),
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      subtotalPaise: 30_000,
      totalPaise: 30_000,
      shippingAddress: {},
      billingAddress: {},
      items: {
        create: [
          { productId: goodProduct, nameSnapshot: 'Mala', skuSnapshot: 'M', quantity: 2, unitPricePaise: 10_000, lineTotalPaise: 20_000 },
          { productId: finalSale, nameSnapshot: 'Kumkum', skuSnapshot: 'K', quantity: 1, unitPricePaise: 10_000, lineTotalPaise: 10_000 },
        ],
      },
    },
    include: { items: true },
  })
}

beforeAll(async () => {
  const u = await db.user.create({ data: { email: `${tag}-staff@example.test`, role: 'STAFF' } })
  staff = { id: u.id, ip: '127.0.0.1' }
  const p = await db.product.create({ data: { slug: `${tag}-m`, sku: `${tag}-M`.toUpperCase(), name: 'Mala', pricePaise: 10_000, status: 'PUBLISHED', inventory: { create: { onHand: 5 } } }, include: { inventory: true } })
  goodProduct = p.id
  inventoryId = p.inventory!.id
  finalSale = (await db.product.create({ data: { slug: `${tag}-k`, sku: `${tag}-K`.toUpperCase(), name: 'Kumkum', pricePaise: 10_000, status: 'PUBLISHED', returnEligible: false } })).id
})

afterAll(async () => {
  const ids = (await db.order.findMany({ where: { orderNumber: { startsWith: tag } }, select: { id: true } })).map((o) => o.id)
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
  await db.order.deleteMany({ where: { id: { in: ids } } })
  await db.product.deleteMany({ where: { slug: { startsWith: tag } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('return requests', () => {
  it('offers only returnable items inside the window', async () => {
    const o = await deliveredOrder(2)
    const r = await returnableItems(o.id, 7)
    expect(r.items.map((i) => i.name)).toEqual(['Mala'])
    expect((await returnableItems(o.id, 0)).items).toEqual([])
    const late = await deliveredOrder(10)
    expect((await returnableItems(late.id, 7)).reason).toMatch(/until/)
  })

  it('refuses impossible quantities, final-sale items and a second open request', async () => {
    const o = await deliveredOrder()
    const mala = o.items.find((i) => i.nameSnapshot === 'Mala')!.id
    const kumkum = o.items.find((i) => i.nameSnapshot === 'Kumkum')!.id
    const who = { userId: null, ip: null }
    expect(await requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 3 }], reason: 'DAMAGED', note: '' }, who)).toMatchObject({ ok: false })
    expect(await requestReturn(o.id, 7, { lines: [{ orderItemId: kumkum, quantity: 1 }], reason: 'DAMAGED', note: '' }, who)).toMatchObject({ ok: false })
    expect(await requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 1 }], reason: 'OTHER', note: '' }, who)).toMatchObject({ ok: false })
    const [a, b] = await Promise.all([
      requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 1 }], reason: 'DAMAGED', note: 'Cracked bead' }, who),
      requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 1 }], reason: 'DAMAGED', note: 'Cracked bead' }, who),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(await db.return.count({ where: { orderId: o.id } })).toBe(1)
  })
})

describe('staff handling', () => {
  it('declining needs a reason the customer will see', async () => {
    const o = await deliveredOrder()
    const mala = o.items.find((i) => i.nameSnapshot === 'Mala')!.id
    await requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 1 }], reason: 'CHANGED_MIND', note: '' }, { userId: null, ip: null })
    const ret = await db.return.findFirstOrThrow({ where: { orderId: o.id } })
    expect(await moveReturn(ret.id, 'REJECT', { note: '', awbNumber: '', restock: false }, staff)).toMatchObject({ ok: false })
    expect(await moveReturn(ret.id, 'REJECT', { note: 'Opened puja items cannot be returned.', awbNumber: '', restock: false }, staff)).toEqual({ ok: true })
    expect(await moveReturn(ret.id, 'APPROVE', { note: '', awbNumber: '', restock: false }, staff)).toMatchObject({ ok: false })
    // A declined request does not use up the quantity.
    expect((await returnableItems(o.id, 7)).items[0].maxQuantity).toBe(2)
  })

  it('receiving restocks when asked, marks the order returned when everything is back, and moves no money', async () => {
    const o = await deliveredOrder()
    // Only the mala is in this order's return; the final-sale kumkum stays with the customer.
    await db.orderItem.deleteMany({ where: { orderId: o.id, nameSnapshot: 'Kumkum' } })
    const mala = o.items.find((i) => i.nameSnapshot === 'Mala')!.id
    await requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 2 }], reason: 'DAMAGED', note: '' }, { userId: null, ip: null })
    const ret = await db.return.findFirstOrThrow({ where: { orderId: o.id } })
    const before = (await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).onHand
    expect(await moveReturn(ret.id, 'APPROVE', { note: '', awbNumber: '', restock: false }, staff)).toEqual({ ok: true })
    expect(await moveReturn(ret.id, 'PICKUP', { note: '', awbNumber: '', restock: false }, staff)).toMatchObject({ ok: false })
    expect(await moveReturn(ret.id, 'PICKUP', { note: '', awbNumber: 'RAWB123', restock: false }, staff)).toEqual({ ok: true })
    expect(await moveReturn(ret.id, 'RECEIVE', { note: '', awbNumber: '', restock: true }, staff)).toEqual({ ok: true })
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).onHand).toBe(before + 2)
    const order = await db.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(order).toMatchObject({ status: 'RETURNED', paymentStatus: 'PAID' })
    expect(await db.refund.count({ where: { orderId: o.id } })).toBe(0)
    expect(await moveReturn(ret.id, 'RECEIVE', { note: '', awbNumber: '', restock: true }, staff)).toMatchObject({ ok: false })
    expect(await moveReturn(ret.id, 'CLOSE', { note: '', awbNumber: '', restock: false }, staff)).toEqual({ ok: true })
    expect(await db.auditLog.count({ where: { entityId: o.id, action: { startsWith: 'return.' } } })).toBe(5)
  })

  it('puts a returned option back into the stock of that option, not of the product', async () => {
    const v = await db.productVariant.create({ data: { productId: goodProduct, sku: `${tag}-V`.toUpperCase(), name: '8 mm', options: {}, inventory: { create: { onHand: 1 } } }, include: { inventory: true } })
    const o = await deliveredOrder()
    await db.orderItem.deleteMany({ where: { orderId: o.id, nameSnapshot: 'Kumkum' } })
    const mala = o.items.find((i) => i.nameSnapshot === 'Mala')!.id
    await db.orderItem.update({ where: { id: mala }, data: { variantId: v.id } })
    await requestReturn(o.id, 7, { lines: [{ orderItemId: mala, quantity: 1 }], reason: 'DAMAGED', note: '' }, { userId: null, ip: null })
    const ret = await db.return.findFirstOrThrow({ where: { orderId: o.id } })
    const productStock = (await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).onHand
    await moveReturn(ret.id, 'APPROVE', { note: '', awbNumber: '', restock: false }, staff)
    expect(await moveReturn(ret.id, 'RECEIVE', { note: '', awbNumber: '', restock: true }, staff)).toEqual({ ok: true })
    expect((await db.inventory.findUniqueOrThrow({ where: { id: v.inventory!.id } })).onHand).toBe(2)
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).onHand).toBe(productStock)
  })
})
