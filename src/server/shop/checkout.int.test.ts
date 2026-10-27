// Integration tests for the cart and order placement against a real
// PostgreSQL database: stock, prices, coupons and payment-method rules.
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import type { CommerceSettings } from '../settings'
import type { AddressInput } from './address'
import { addToCart, adoptGuestCart, createCart, loadCartLines, setLineQuantity } from './cart'
import { findOrderForViewer, newOrderNumber, placeOrder, type PlaceOrderInput } from './checkout'

const tag = `it-co-${Date.now()}`
let n = 0

const settings: CommerceSettings = {
  shippingFlatPaise: 7_900,
  shippingFreeAbovePaise: 99_900,
  codEnabled: true,
  codFeePaise: 4_900,
  codMinOrderPaise: 0,
  codMaxOrderPaise: 1_000_000,
}

const address: AddressInput = {
  fullName: 'Test Buyer',
  phone: '9876543210',
  line1: '12 Temple Road',
  line2: null,
  landmark: null,
  city: 'Varanasi',
  state: 'Uttar Pradesh',
  pincode: '221001',
}

async function product(onHand: number, pricePaise = 50_000, extra: object = {}) {
  n++
  return db.product.create({
    data: { sku: `${tag}-${n}`, slug: `${tag}-${n}`, name: `Test product ${n}`, pricePaise, status: 'PUBLISHED', inventory: { create: { onHand } }, ...extra },
    select: { id: true, inventory: { select: { id: true } } },
  })
}

async function cartWith(productId: string, quantity: number, userId: string | null = null) {
  const cart = await createCart(userId)
  const r = await addToCart(cart.id, productId, null, quantity)
  expect(r.ok).toBe(true)
  return cart.id
}

function input(cartId: string, over: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return { cartId, userId: null, email: `${tag}@example.test`, address, paymentMethod: 'COD', couponCode: null, customerNote: null, saveAddress: false, ...over }
}

afterAll(async () => {
  await db.order.deleteMany({ where: { guestEmail: { startsWith: tag } } })
  await db.order.deleteMany({ where: { user: { email: { startsWith: tag } } } })
  await db.cart.deleteMany({ where: { items: { some: { product: { sku: { startsWith: tag } } } } } })
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.coupon.deleteMany({ where: { code: { startsWith: tag.toUpperCase() } } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await db.$disconnect()
})

describe('cart', () => {
  it('caps a line at the stock available and at 10', async () => {
    const p = await product(3)
    const cart = await createCart(null)
    expect(await addToCart(cart.id, p.id, null, 5)).toEqual({ ok: false, reason: 'LIMITED_STOCK', available: 3 })
    expect((await loadCartLines(cart.id))[0].quantity).toBe(3)

    const big = await product(50)
    await addToCart(cart.id, big.id, null, 8)
    await addToCart(cart.id, big.id, null, 8)
    expect((await loadCartLines(cart.id)).find((l) => l.productId === big.id)?.quantity).toBe(10)
  })

  it('two quick adds of the same item make one line, not two', async () => {
    const p = await product(20)
    const cart = await createCart(null)
    await Promise.all([addToCart(cart.id, p.id, null, 1), addToCart(cart.id, p.id, null, 1)])
    const lines = await loadCartLines(cart.id)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(2)
  })

  it('refuses sold-out, draft and unknown products', async () => {
    const cart = await createCart(null)
    const soldOut = await product(0)
    const draft = await product(5, 50_000, { status: 'DRAFT' })
    expect(await addToCart(cart.id, soldOut.id, null, 1)).toEqual({ ok: false, reason: 'OUT_OF_STOCK' })
    expect(await addToCart(cart.id, draft.id, null, 1)).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(await addToCart(cart.id, 'nope', null, 1)).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('quantity 0 removes a line; lines of another cart cannot be changed', async () => {
    const p = await product(5)
    const mine = await cartWith(p.id, 2)
    const other = await createCart(null)
    const [line] = await loadCartLines(mine)
    expect(await setLineQuantity(other.id, line.itemId, 0)).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(await setLineQuantity(mine, line.itemId, 0)).toEqual({ ok: true })
    expect(await loadCartLines(mine)).toHaveLength(0)
  })

  it('a guest cart joins the account cart at sign-in', async () => {
    const user = await db.user.create({ data: { email: `${tag}-adopt@example.test` } })
    const a = await product(10)
    const b = await product(10)
    const userCart = await cartWith(a.id, 1, user.id)
    const guestCart = await createCart(null)
    await addToCart(guestCart.id, a.id, null, 3)
    await addToCart(guestCart.id, b.id, null, 2)

    await adoptGuestCart(guestCart.id, user.id)
    const lines = await loadCartLines(userCart)
    expect(lines.map((l) => [l.productId, l.quantity])).toEqual([
      [a.id, 3],
      [b.id, 2],
    ])
    expect(await db.cart.findUnique({ where: { id: guestCart.id } })).toBeNull()
  })
})

describe('placing an order', () => {
  it('uses database prices, reserves stock, clears the cart and is not marked paid', async () => {
    const p = await product(5, 40_000)
    const cartId = await cartWith(p.id, 2)
    // The price changes after the item went into the cart: the order uses the new price.
    await db.product.update({ where: { id: p.id }, data: { pricePaise: 45_000 } })

    const r = await placeOrder(input(cartId), settings, false)
    if (!r.ok) throw new Error(r.message)
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true, payments: true } })

    expect(order.subtotalPaise).toBe(90_000)
    expect(order.shippingPaise).toBe(7_900)
    expect(order.codFeePaise).toBe(4_900)
    expect(order.totalPaise).toBe(102_800)
    expect(order.items[0]).toMatchObject({ unitPricePaise: 45_000, quantity: 2, lineTotalPaise: 90_000 })
    expect(order.status).toBe('CONFIRMED')
    expect(order.paymentStatus).toBe('PENDING')
    expect(order.payments).toHaveLength(1)
    expect(order.payments[0]).toMatchObject({ method: 'COD', status: 'PENDING', amountPaise: 102_800 })
    expect(order.orderNumber).toMatch(/^DM-\d{6}-[2-9A-Z]{6}$/)

    const inv = await db.inventory.findUniqueOrThrow({ where: { id: p.inventory!.id } })
    expect(inv).toMatchObject({ onHand: 5, reserved: 2 })
    expect(await db.inventoryMovement.count({ where: { orderId: order.id, reason: 'RESERVATION' } })).toBe(1)
    expect(await loadCartLines(cartId)).toHaveLength(0)
  })

  it('never oversells: two buyers for the last unit, exactly one order', async () => {
    const p = await product(1)
    const [c1, c2] = await Promise.all([cartWith(p.id, 1), cartWith(p.id, 1)])
    const results = await Promise.all([placeOrder(input(c1), settings, false), placeOrder(input(c2), settings, false)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'CART_CHANGED' })
    const inv = await db.inventory.findUniqueOrThrow({ where: { id: p.inventory!.id } })
    expect(inv.reserved).toBe(1)
  })

  it('stops if an item was unpublished after it went into the cart', async () => {
    const p = await product(5)
    const cartId = await cartWith(p.id, 1)
    await db.product.update({ where: { id: p.id }, data: { status: 'ARCHIVED' } })
    expect(await placeOrder(input(cartId), settings, false)).toMatchObject({ ok: false, reason: 'CART_CHANGED' })
  })

  it('enforces the payment-method rules', async () => {
    const p = await product(10, 50_000)
    const cartId = await cartWith(p.id, 1)
    expect(await placeOrder(input(cartId), { ...settings, codEnabled: false }, false)).toMatchObject({ ok: false, reason: 'PAYMENT_METHOD' })
    expect(await placeOrder(input(cartId), { ...settings, codMaxOrderPaise: 10_000 }, false)).toMatchObject({ ok: false, reason: 'PAYMENT_METHOD' })
    expect(await placeOrder(input(cartId), { ...settings, codMinOrderPaise: 100_000 }, false)).toMatchObject({ ok: false, reason: 'PAYMENT_METHOD' })
    // Online payment is refused until Razorpay is configured.
    expect(await placeOrder(input(cartId, { paymentMethod: 'RAZORPAY' }), settings, false)).toMatchObject({ ok: false, reason: 'PAYMENT_METHOD' })
    // Nothing was reserved by the refused attempts.
    expect((await db.inventory.findUniqueOrThrow({ where: { id: p.inventory!.id } })).reserved).toBe(0)
  })

  it('an online order waits for payment and has no COD fee', async () => {
    const p = await product(10, 50_000)
    const r = await placeOrder(input(await cartWith(p.id, 1), { paymentMethod: 'RAZORPAY' }), settings, true)
    if (!r.ok) throw new Error(r.message)
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } })
    expect(order).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING', codFeePaise: 0, totalPaise: 57_900 })
  })

  it('applies a coupon once, and its total limit holds under concurrent orders', async () => {
    const coupon = await db.coupon.create({
      data: { code: `${tag.toUpperCase()}-ONCE`, type: 'FIXED', valuePaise: 10_000, usageLimitTotal: 1, usageLimitPerUser: 5 },
    })
    const p = await product(10, 50_000)
    const [c1, c2] = await Promise.all([cartWith(p.id, 1), cartWith(p.id, 1)])
    const results = await Promise.all([
      placeOrder(input(c1, { couponCode: coupon.code.toLowerCase(), email: `${tag}-a@example.test` }), settings, false),
      placeOrder(input(c2, { couponCode: coupon.code, email: `${tag}-b@example.test` }), settings, false),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'COUPON' })
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).timesUsed).toBe(1)
    const ok = results.find((r) => r.ok)!
    if (!ok.ok) throw new Error()
    expect((await db.order.findUniqueOrThrow({ where: { id: ok.orderId } })).discountPaise).toBe(10_000)
  })

  it('applies a category coupon only to items in that category or its sub-categories', async () => {
    const malas = await db.category.create({ data: { slug: `${tag}-malas`, name: 'Malas' } })
    const tulsi = await db.category.create({ data: { slug: `${tag}-tulsi`, name: 'Tulsi Malas', parentId: malas.id } })
    const other = await db.category.create({ data: { slug: `${tag}-other`, name: 'Incense' } })
    try {
      const mala = await product(5, 60_000, { categoryId: tulsi.id })
      const incense = await product(5, 40_000, { categoryId: other.id })
      const coupon = await db.coupon.create({ data: { code: `${tag.toUpperCase()}-CAT`, type: 'PERCENTAGE', valueBp: 1_000, minOrderPaise: 50_000, appliesToCategory: malas.id } })

      // Only incense: refused, and the customer is told which items it is for.
      const onlyIncense = await cartWith(incense.id, 2)
      expect(await placeOrder(input(onlyIncense, { couponCode: coupon.code }), settings, false)).toMatchObject({ ok: false, reason: 'COUPON', message: expect.stringContaining('Malas') })

      const cart = await cartWith(mala.id, 1)
      await addToCart(cart, incense.id, null, 1)
      const r = await placeOrder(input(cart, { couponCode: coupon.code, email: `${tag}-cat@example.test` }), settings, false)
      expect(r.ok).toBe(true)
      const order = await db.order.findFirstOrThrow({ where: { guestEmail: `${tag}-cat@example.test` } })
      // 10% of the ₹600 mala only. ₹940 after discount is below free shipping, so shipping and the COD fee are added.
      expect(order).toMatchObject({ subtotalPaise: 100_000, discountPaise: 6_000, shippingPaise: 7_900, totalPaise: 94_000 + 7_900 + 4_900 })
    } finally {
      await db.coupon.deleteMany({ where: { code: `${tag.toUpperCase()}-CAT` } })
      await db.order.deleteMany({ where: { guestEmail: { startsWith: tag } } })
      await db.cart.deleteMany({ where: { items: { some: { product: { sku: { startsWith: tag } } } } } })
      await db.product.deleteMany({ where: { categoryId: { in: [tulsi.id, other.id] } } })
      await db.category.deleteMany({ where: { slug: { startsWith: tag } } })
    }
  })

  it('limits a coupon per customer, guests included', async () => {
    const coupon = await db.coupon.create({ data: { code: `${tag.toUpperCase()}-PER`, type: 'PERCENTAGE', valueBp: 1_000 } })
    const p = await product(10, 50_000)
    const email = `${tag}-per@example.test`
    expect((await placeOrder(input(await cartWith(p.id, 1), { couponCode: coupon.code, email }), settings, false)).ok).toBe(true)
    expect(await placeOrder(input(await cartWith(p.id, 1), { couponCode: coupon.code, email }), settings, false)).toMatchObject({
      ok: false,
      reason: 'COUPON',
    })
  })

  it('shows an order only to its owner or the holder of its link', async () => {
    const p = await product(10)
    const r = await placeOrder(input(await cartWith(p.id, 1)), settings, false)
    if (!r.ok) throw new Error(r.message)
    expect(await findOrderForViewer(r.orderNumber, { userId: null, accessToken: r.accessToken })).not.toBeNull()
    expect(await findOrderForViewer(r.orderNumber, { userId: null, accessToken: 'wrong' })).toBeNull()
    expect(await findOrderForViewer(r.orderNumber, { userId: null, accessToken: null })).toBeNull()
    expect(await findOrderForViewer(r.orderNumber, { userId: 'someone-else', accessToken: null })).toBeNull()
    const visible = await findOrderForViewer(r.orderNumber, { userId: null, accessToken: r.accessToken })
    expect(visible).not.toHaveProperty('accessTokenHash')
  })

  it('saves the address to the account when asked', async () => {
    const user = await db.user.create({ data: { email: `${tag}-addr@example.test` } })
    const p = await product(10)
    const r = await placeOrder(input(await cartWith(p.id, 1, user.id), { userId: user.id, saveAddress: true }), settings, false)
    expect(r.ok).toBe(true)
    const saved = await db.address.findMany({ where: { userId: user.id } })
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ pincode: '221001', isDefault: true })
  })
})

describe('order numbers', () => {
  it('use the India date and an unambiguous alphabet', () => {
    expect(newOrderNumber(new Date('2026-10-26T20:00:00Z'))).toMatch(/^DM-261027-[2-9A-HJKMNP-Z]{6}$/)
  })
})
