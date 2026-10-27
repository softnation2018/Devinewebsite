import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from './db'

const sent: { to: string; subject: string; text: string }[] = []
let failFor = ''
vi.mock('./email', () => ({
  sendEmail: async (e: { to: string; subject: string; text: string }) => {
    if (e.to === failFor) return { sent: false }
    sent.push(e)
    return { sent: true }
  },
}))

const { queueCustomerEmail, runEmailJobs } = await import('./notifications')
const { setManualShipmentStatus } = await import('./shipping/shipments')

const tag = `it-mail-${Date.now()}`
let staff: { id: string; ip: string }
let customerEmail: string
let orderId: string
let shipmentId: string

const jobsFor = (id: string) => db.job.findMany({ where: { payload: { path: ['orderId'], equals: id } }, orderBy: { createdAt: 'asc' } })

beforeAll(async () => {
  staff = { id: (await db.user.create({ data: { email: `${tag}-staff@example.test`, role: 'STAFF' } })).id, ip: '127.0.0.1' }
  customerEmail = `${tag}-asha@example.test`
  const user = await db.user.create({ data: { email: customerEmail, name: 'Asha Verma' } })
  const order = await db.order.create({
    data: { orderNumber: `${tag}-1`, userId: user.id, status: 'CONFIRMED', paymentMethod: 'COD', subtotalPaise: 100, totalPaise: 100, shippingAddress: {}, billingAddress: {} },
  })
  orderId = order.id
  shipmentId = (await db.shipment.create({ data: { orderId, provider: 'MANUAL', status: 'CREATED', courierName: 'DTDC', awbNumber: `${tag}-AWB`, idempotencyKey: `${tag}-s` } })).id
})

afterAll(async () => {
  await db.job.deleteMany({ where: { payload: { path: ['orderId'], equals: orderId } } })
  await db.auditLog.deleteMany({ where: { actorUserId: staff.id } })
  await db.order.deleteMany({ where: { orderNumber: { startsWith: tag } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('customer email queue', () => {
  it('queues nothing when the change is rolled back', async () => {
    await db
      .$transaction(async (tx) => {
        await queueCustomerEmail(tx, { kind: 'order_cancelled', orderId })
        throw new Error('rollback')
      })
      .catch(() => {})
    expect(await jobsFor(orderId)).toHaveLength(0)
  })

  it('queues "shipped" then "delivered" as the parcel moves, and sends them once', async () => {
    expect(await setManualShipmentStatus(shipmentId, 'IN_TRANSIT', staff)).toMatchObject({ ok: true })
    expect(await setManualShipmentStatus(shipmentId, 'DELIVERED', staff)).toMatchObject({ ok: true })
    expect((await jobsFor(orderId)).map((j) => j.kind)).toEqual(['email.order_shipped', 'email.order_delivered'])

    await runEmailJobs(200)
    const mine = sent.filter((e) => e.to === customerEmail)
    expect(mine.map((e) => e.subject)).toEqual([`Order ${tag}-1 is on its way`, `Order ${tag}-1 delivered`])
    expect(mine[0].text).toContain(`${tag}-AWB`)
    expect(mine[0].text).toContain('Namaste Asha,')
    expect((await jobsFor(orderId)).every((j) => j.status === 'SUCCEEDED')).toBe(true)

    await runEmailJobs(200)
    expect(sent.filter((e) => e.to === customerEmail)).toHaveLength(2)
  })

  it('retries a failed send later, and gives up after the last attempt', async () => {
    failFor = customerEmail
    await db.$transaction((tx) => queueCustomerEmail(tx, { kind: 'order_cancelled', orderId }))
    await runEmailJobs(200)
    let job = (await jobsFor(orderId)).find((j) => j.kind === 'email.order_cancelled')!
    expect(job).toMatchObject({ status: 'QUEUED', attempts: 1 })
    expect(job.runAfter.getTime()).toBeGreaterThan(Date.now())

    await db.job.update({ where: { id: job.id }, data: { attempts: job.maxAttempts - 1, runAfter: new Date(0) } })
    await runEmailJobs(200)
    job = (await db.job.findUniqueOrThrow({ where: { id: job.id } }))
    expect(job.status).toBe('DEAD')
    failFor = ''
  })
})
