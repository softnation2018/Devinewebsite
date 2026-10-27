import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { createCoupon, parseCouponForm, updateCoupon } from './coupons'
import { adjustStock, createProduct, parseProductForm, updateProduct } from './products'

const tag = `it-cat-${Date.now()}`
let n = 0

async function actor() {
  const u = await db.user.create({ data: { email: `${tag}-${++n}@example.test`, role: 'ADMIN' } })
  return { id: u.id, ip: '127.0.0.1', canCost: true }
}

function productInput(over: Record<string, string> = {}) {
  n++
  const f = new FormData()
  const fields = { name: `Test bead ${n}`, slug: `${tag}-${n}`, sku: `${tag}-${n}`.toUpperCase().slice(-30), price: '499', costPrice: '200', gstRateBp: '0', weightGrams: '50', lowStockThreshold: '2', status: 'DRAFT', ...over }
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  const r = parseProductForm(f)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

afterAll(async () => {
  await db.product.deleteMany({ where: { slug: { startsWith: tag } } })
  await db.coupon.deleteMany({ where: { code: { startsWith: 'ITCAT' } , description: tag } })
  await db.auditLog.deleteMany({ where: { actor: { email: { startsWith: tag } } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('products', () => {
  it('creates a product with an empty stock record and an audit row', async () => {
    const a = await actor()
    const r = await createProduct(productInput(), a)
    expect(r.ok).toBe(true)
    const p = await db.product.findUniqueOrThrow({ where: { id: r.id! }, include: { inventory: true } })
    expect(p).toMatchObject({ pricePaise: 49_900, costPricePaise: 20_000, status: 'DRAFT', publishedAt: null })
    expect(p.inventory).toMatchObject({ onHand: 0, reserved: 0 })
    expect(await db.auditLog.count({ where: { entityId: p.id, action: 'product.create' } })).toBe(1)
  })

  it('never stores a cost price from someone not allowed to see it', async () => {
    const a = { ...(await actor()), canCost: false }
    const r = await createProduct(productInput({ costPrice: '1' }), a)
    expect((await db.product.findUniqueOrThrow({ where: { id: r.id! } })).costPricePaise).toBeNull()
  })

  it('refuses to publish promised outcomes, and unconfirmed claims needing evidence', async () => {
    const a = await actor()
    expect(await createProduct(productInput({ status: 'PUBLISHED', description: 'Guaranteed success in business' }), a)).toMatchObject({ ok: false })
    expect(await createProduct(productInput({ status: 'PUBLISHED', description: 'Lab certified original' }), a)).toMatchObject({ ok: false })
    expect(await createProduct(productInput({ status: 'PUBLISHED', description: 'Lab certified original', claimsConfirmed: 'on' }), a)).toMatchObject({ ok: true })
    // A draft can hold any wording while it is being written.
    expect(await createProduct(productInput({ description: 'Guaranteed success in business' }), a)).toMatchObject({ ok: true })
  })

  it('reports a duplicate SKU plainly and records only the fields that changed', async () => {
    const a = await actor()
    const first = productInput()
    await createProduct(first, a)
    const dup = await createProduct({ ...productInput(), sku: first.sku }, a)
    expect(dup).toEqual({ ok: false, error: 'Another product already uses this SKU.' })

    const input = productInput()
    const { id } = await createProduct(input, a)
    expect(await updateProduct(id!, { ...input, pricePaise: 59_900 }, a)).toEqual({ ok: true })
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'product.update' } })
    expect(log.before).toEqual({ pricePaise: 49_900 })
    expect(log.after).toEqual({ pricePaise: 59_900 })
    expect((await db.product.findUniqueOrThrow({ where: { id } })).pricePaise).toBe(59_900)
    // Saving with nothing changed writes no audit row.
    expect(await updateProduct(id!, { ...input, pricePaise: 59_900 }, a)).toEqual({ ok: true })
    expect(await db.auditLog.count({ where: { entityId: id, action: 'product.update' } })).toBe(1)
  })

  it('will not put demo products on sale', async () => {
    const a = await actor()
    const input = productInput()
    const { id } = await createProduct(input, a)
    await db.product.update({ where: { id }, data: { isDemo: true } })
    expect(await updateProduct(id!, { ...input, status: 'PUBLISHED' }, a)).toMatchObject({ ok: false })
  })
})

describe('stock', () => {
  it('adds and removes stock with a movement each, but never below what orders hold', async () => {
    const a = await actor()
    const { id } = await createProduct(productInput(), a)
    expect(await adjustStock({ productId: id! }, 10, 'PURCHASE', 'Bill 12', a)).toEqual({ ok: true, onHand: 10 })
    await db.inventory.update({ where: { productId: id }, data: { reserved: 4 } })
    expect(await adjustStock({ productId: id! }, -7, 'DAMAGE', '', a)).toMatchObject({ ok: false })
    expect(await adjustStock({ productId: id! }, -6, 'DAMAGE', 'Cracked', a)).toEqual({ ok: true, onHand: 4 })
    expect(await adjustStock({ productId: id! }, 3, 'DAMAGE', '', a)).toMatchObject({ ok: false })
    expect(await adjustStock({ productId: id! }, -1, 'MANUAL_ADJUSTMENT', '', a)).toMatchObject({ ok: false })
    const inv = await db.inventory.findUniqueOrThrow({ where: { productId: id }, include: { movements: true } })
    expect(inv.onHand).toBe(4)
    expect(inv.movements.map((m) => [m.reason, m.delta]).sort()).toEqual([['DAMAGE', -6], ['PURCHASE', 10]])
    expect(await db.auditLog.count({ where: { entityId: id, action: 'stock.adjust' } })).toBe(2)
  })

  it('serialises concurrent changes so none is lost', async () => {
    const a = await actor()
    const { id } = await createProduct(productInput(), a)
    await Promise.all(Array.from({ length: 8 }, () => adjustStock({ productId: id! }, 5, 'PURCHASE', '', a)))
    expect((await db.inventory.findUniqueOrThrow({ where: { productId: id } })).onHand).toBe(40)
  })
})

describe('coupons', () => {
  function couponInput(code: string, over: Record<string, string> = {}) {
    const f = new FormData()
    for (const [k, v] of Object.entries({ code, description: tag, type: 'PERCENTAGE', percent: '10', usageLimitPerUser: '1', isActive: 'on', ...over })) f.set(k, v)
    const r = parseCouponForm(f)
    if (!r.ok) throw new Error(r.error)
    return r.value
  }

  it('fixes the code and discount once a coupon has been used', async () => {
    const a = await actor()
    const code = `ITCAT${Date.now()}`
    const r = await createCoupon(couponInput(code), a)
    expect(r.ok).toBe(true)
    expect(await createCoupon(couponInput(code), a)).toEqual({ ok: false, error: 'A coupon with this code already exists.' })
    expect(await updateCoupon(r.id!, couponInput(code, { percent: '15' }), a)).toEqual({ ok: true })

    await db.coupon.update({ where: { id: r.id }, data: { timesUsed: 3 } })
    expect(await updateCoupon(r.id!, couponInput(code, { percent: '20' }), a)).toMatchObject({ ok: false })
    expect(await updateCoupon(r.id!, couponInput(code, { percent: '15', usageLimitTotal: '2' }), a)).toMatchObject({ ok: false })
    expect(await updateCoupon(r.id!, couponInput(code, { percent: '15', usageLimitTotal: '50', isActive: '' }), a)).toEqual({ ok: true })
    const c = await db.coupon.findUniqueOrThrow({ where: { id: r.id } })
    expect(c).toMatchObject({ valueBp: 1500, usageLimitTotal: 50, isActive: false })
  })
})
