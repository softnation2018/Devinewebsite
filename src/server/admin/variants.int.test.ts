import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

import { db } from '../db'
import { productOffer } from '../catalog'
import { addToCart, createCart, loadCartLines } from '../shop/cart'
import { adjustStock } from './products'
import { createVariant, parseVariantForm, updateVariant } from './variants'

const tag = `it-var-${Date.now()}`
let n = 0

async function actor() {
  const u = await db.user.create({ data: { email: `${tag}-${++n}@example.test`, role: 'ADMIN' } })
  return { id: u.id, ip: '127.0.0.1' }
}

async function product() {
  n++
  return db.product.create({
    data: { slug: `${tag}-${n}`, sku: `ITVAR${Date.now()}${n}`, name: `Rudraksha ${n}`, pricePaise: 50_000, status: 'PUBLISHED', inventory: { create: { onHand: 5 } } },
  })
}

function variantInput(over: Record<string, string> = {}) {
  const f = new FormData()
  for (const [k, v] of Object.entries({ name: '5 Mukhi', sku: `ITVAR-${Date.now()}-${++n}`, price: '', compareAt: '', weight: '', isActive: 'on', ...over })) f.set(k, v)
  const r = parseVariantForm(f)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

afterAll(async () => {
  await db.cart.deleteMany({ where: { items: { some: { product: { slug: { startsWith: tag } } } } } })
  await db.product.deleteMany({ where: { slug: { startsWith: tag } } })
  await db.auditLog.deleteMany({ where: { actor: { email: { startsWith: tag } } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('product options', () => {
  it('checks the form: compare-at needs a higher price, weight is whole grams', () => {
    const f = (o: Record<string, string>) => {
      const d = new FormData()
      for (const [k, v] of Object.entries({ name: '7 Mukhi', sku: 'AB-1', price: '', compareAt: '', weight: '', ...o })) d.set(k, v)
      return parseVariantForm(d)
    }
    expect(f({}).ok).toBe(true)
    expect(f({ compareAt: '600' }).ok).toBe(false)
    expect(f({ price: '600', compareAt: '500' }).ok).toBe(false)
    expect(f({ weight: '12.5' }).ok).toBe(false)
    expect(f({ sku: 'a' }).ok).toBe(false)
  })

  it('creates an option with its own empty stock and an audit row, and refuses a SKU already in use', async () => {
    const a = await actor()
    const p = await product()
    const input = variantInput({ price: '650' })
    const r = await createVariant(p.id, input, a)
    expect(r.ok).toBe(true)
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: r.id! }, include: { inventory: true } })
    expect(v).toMatchObject({ pricePaise: 65_000, weightGrams: null, isActive: true })
    expect(v.inventory).toMatchObject({ onHand: 0, reserved: 0 })
    expect(await db.auditLog.count({ where: { entityId: v.id, action: 'variant.create' } })).toBe(1)

    expect(await createVariant(p.id, { ...input }, a)).toMatchObject({ ok: false })
    expect(await createVariant(p.id, variantInput({ sku: p.sku }), a)).toMatchObject({ ok: false })
    expect(await createVariant('nope', variantInput(), a)).toMatchObject({ ok: false })
  })

  it('records only what changed when an option is edited', async () => {
    const a = await actor()
    const p = await product()
    const input = variantInput()
    const { id } = await createVariant(p.id, input, a)
    expect(await updateVariant(id!, input, a)).toEqual({ ok: true })
    expect(await db.auditLog.count({ where: { entityId: id, action: 'variant.update' } })).toBe(0)
    expect(await updateVariant(id!, { ...input, price: 70_000 }, a)).toEqual({ ok: true })
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'variant.update' } })
    expect(log.before).toEqual({ pricePaise: null })
    expect(log.after).toEqual({ pricePaise: 70_000 })
  })

  it('keeps stock per option, and the cart sells the chosen option at its own price', async () => {
    const a = await actor()
    const p = await product()
    const cheap = await createVariant(p.id, variantInput({ name: '5 Mukhi' }), a)
    const dear = await createVariant(p.id, variantInput({ name: '7 Mukhi', price: '900', weight: '20' }), a)
    expect(await adjustStock({ variantId: dear.id! }, 2, 'PURCHASE', '', a)).toEqual({ ok: true, onHand: 2 })
    expect(await db.auditLog.count({ where: { entityId: dear.id, action: 'stock.adjust', entityType: 'ProductVariant' } })).toBe(1)

    const cart = await createCart(null)
    // The product itself has stock, but once it is sold in options a choice is required.
    expect(await addToCart(cart.id, p.id, null, 1)).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(await addToCart(cart.id, p.id, cheap.id!, 1)).toEqual({ ok: false, reason: 'OUT_OF_STOCK' })
    // Asking for more than there is puts in what there is.
    expect(await addToCart(cart.id, p.id, dear.id!, 3)).toEqual({ ok: false, reason: 'LIMITED_STOCK', available: 2 })

    const [line] = await loadCartLines(cart.id)
    expect(line).toMatchObject({ quantity: 2, variantName: '7 Mukhi', unitPricePaise: 90_000, weightGrams: 20, available: 2, problem: null })

    // Taking the option off sale makes the line unbuyable rather than silently swapping it.
    await updateVariant(dear.id!, variantInput({ name: '7 Mukhi', sku: (await db.productVariant.findUniqueOrThrow({ where: { id: dear.id } })).sku, price: '900', weight: '20', isActive: '' }), a)
    expect((await loadCartLines(cart.id))[0].problem).toBe('UNAVAILABLE')
  })

  it('shows the lowest option price, as "from" only when options differ', () => {
    const inv = (onHand: number) => ({ onHand, reserved: 0 })
    const base = { pricePaise: 500, compareAtPaise: 800, inventory: inv(9) }
    expect(productOffer({ ...base, variants: [] })).toEqual({ pricePaise: 500, compareAtPaise: 800, available: 9, from: false })
    expect(productOffer({ ...base, variants: [{ pricePaise: null, compareAtPaise: null, inventory: inv(1) }, { pricePaise: 400, compareAtPaise: null, inventory: inv(2) }] })).toEqual({
      pricePaise: 400,
      compareAtPaise: null,
      available: 3,
      from: true,
    })
    expect(productOffer({ ...base, variants: [{ pricePaise: null, compareAtPaise: null, inventory: inv(0) }] })).toEqual({ pricePaise: 500, compareAtPaise: 800, available: 0, from: false })
  })
})
