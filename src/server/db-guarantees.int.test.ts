// Integration tests: these run against a real PostgreSQL database and prove
// that the safety rules hold in the database itself, not only in our code.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db'

const tag = `it-${Date.now()}`

beforeAll(async () => {
  await db.$connect()
})

afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { providerEventId: { startsWith: tag } } })
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.order.deleteMany({ where: { orderNumber: { startsWith: tag } } })
  await db.$disconnect()
})

async function makeProduct(suffix: string, onHand: number) {
  return db.product.create({
    data: {
      sku: `${tag}-${suffix}`,
      slug: `${tag}-${suffix}`,
      name: 'Integration test product',
      pricePaise: 10_000,
      inventory: { create: { onHand } },
    },
    include: { inventory: true },
  })
}

describe('database guarantees', () => {
  it('records a webhook event only once', async () => {
    const event = { provider: 'razorpay', providerEventId: `${tag}-evt`, eventType: 'payment.captured', payload: {} }
    await db.webhookEvent.create({ data: event })
    await expect(db.webhookEvent.create({ data: event })).rejects.toThrow()
    expect(await db.webhookEvent.count({ where: { providerEventId: event.providerEventId } })).toBe(1)
  })

  it('refuses to take stock below zero', async () => {
    const p = await makeProduct('neg', 1)
    await expect(
      db.inventory.update({ where: { id: p.inventory!.id }, data: { onHand: { decrement: 2 } } }),
    ).rejects.toThrow()
  })

  it('refuses to reserve more than is on hand', async () => {
    const p = await makeProduct('res', 3)
    await expect(
      db.inventory.update({ where: { id: p.inventory!.id }, data: { reserved: 4 } }),
    ).rejects.toThrow()
  })

  it('refuses a second shipment with the same idempotency key', async () => {
    const order = await db.order.create({
      data: {
        orderNumber: `${tag}-ord`,
        paymentMethod: 'COD',
        subtotalPaise: 10_000,
        totalPaise: 10_000,
        shippingAddress: {},
        billingAddress: {},
      },
    })
    const shipment = { orderId: order.id, provider: 'ITHINK' as const, idempotencyKey: `${tag}-ship` }
    await db.shipment.create({ data: shipment })
    await expect(db.shipment.create({ data: shipment })).rejects.toThrow()
  })

  it('refuses negative order totals', async () => {
    await expect(
      db.order.create({
        data: {
          orderNumber: `${tag}-negative`,
          paymentMethod: 'RAZORPAY',
          subtotalPaise: 10_000,
          totalPaise: -1,
          shippingAddress: {},
          billingAddress: {},
        },
      }),
    ).rejects.toThrow()
  })
})
