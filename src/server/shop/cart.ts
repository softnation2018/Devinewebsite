// Cart storage and the live view of a cart. No cookies here (see
// cart-session.ts), so this can be tested directly against the database.
//
// A cart stores only product ids and quantities. Prices and stock are read
// fresh from the database every time a cart is shown or checked out.

import type { Prisma } from '@/generated/prisma/client'
import { db } from '../db'
import { hashToken, newToken } from '../auth/tokens'

export const MAX_LINE_QUANTITY = 10
export const CART_DAYS = 30

type Tx = Prisma.TransactionClient

function cartExpiry() {
  return new Date(Date.now() + CART_DAYS * 24 * 60 * 60 * 1000)
}

export async function createCart(userId: string | null): Promise<{ id: string; token: string }> {
  const token = newToken()
  const cart = await db.cart.create({
    data: { userId, token: hashToken(token), expiresAt: cartExpiry() },
    select: { id: true },
  })
  return { id: cart.id, token }
}

/** A guest cart from its cookie token. Carts that belong to an account are not returned. */
export async function findGuestCartId(token: string | undefined): Promise<string | null> {
  if (!token || token.length > 100) return null
  const cart = await db.cart.findUnique({
    where: { token: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  })
  return cart && cart.userId === null && cart.expiresAt > new Date() ? cart.id : null
}

export async function findUserCartId(userId: string): Promise<string | null> {
  const cart = await db.cart.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  return cart?.id ?? null
}

async function lockCart(tx: Tx, cartId: string) {
  // Serialises changes to one cart, so two quick clicks cannot create
  // duplicate lines or skip the stock check.
  await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`
}

type Purchasable = { productId: string; variantId: string | null; available: number }

async function findPurchasable(tx: Tx, productId: string, variantId: string | null): Promise<Purchasable | null> {
  const stock = { select: { onHand: true, reserved: true } }
  let inv: { onHand: number; reserved: number } | null
  if (variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId, isActive: true, product: { status: 'PUBLISHED' } },
      select: { inventory: stock },
    })
    if (!variant) return null
    inv = variant.inventory
  } else {
    const product = await tx.product.findFirst({ where: { id: productId, status: 'PUBLISHED' }, select: { inventory: stock } })
    if (!product) return null
    inv = product.inventory
  }
  return { productId, variantId, available: inv ? Math.max(0, inv.onHand - inv.reserved) : 0 }
}

export type CartChange = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'OUT_OF_STOCK' | 'LIMITED_STOCK'; available?: number }

export async function addToCart(cartId: string, productId: string, variantId: string | null, quantity: number): Promise<CartChange> {
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, reason: 'NOT_FOUND' }
  return db.$transaction(async (tx) => {
    await lockCart(tx, cartId)
    const item = await findPurchasable(tx, productId, variantId)
    if (!item) return { ok: false, reason: 'NOT_FOUND' } as const
    if (item.available === 0) return { ok: false, reason: 'OUT_OF_STOCK' } as const

    const existing = await tx.cartItem.findFirst({ where: { cartId, productId, variantId }, select: { id: true, quantity: true } })
    const wanted = Math.min((existing?.quantity ?? 0) + quantity, MAX_LINE_QUANTITY)
    const newQuantity = Math.min(wanted, item.available)

    if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } })
    else await tx.cartItem.create({ data: { cartId, productId, variantId, quantity: newQuantity } })
    await tx.cart.update({ where: { id: cartId }, data: { expiresAt: cartExpiry() } })

    return newQuantity < wanted ? ({ ok: false, reason: 'LIMITED_STOCK', available: item.available } as const) : ({ ok: true } as const)
  })
}

/** Sets a line's quantity; 0 removes it. Quantities above the stock on hand are capped. */
export async function setLineQuantity(cartId: string, itemId: string, quantity: number): Promise<CartChange> {
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, reason: 'NOT_FOUND' }
  return db.$transaction(async (tx) => {
    await lockCart(tx, cartId)
    const line = await tx.cartItem.findFirst({ where: { id: itemId, cartId }, select: { id: true, productId: true, variantId: true } })
    if (!line) return { ok: false, reason: 'NOT_FOUND' } as const
    if (quantity === 0) {
      await tx.cartItem.delete({ where: { id: line.id } })
      return { ok: true } as const
    }
    const item = await findPurchasable(tx, line.productId, line.variantId)
    const capped = Math.min(quantity, MAX_LINE_QUANTITY, item?.available ?? 0)
    if (capped === 0) {
      await tx.cartItem.delete({ where: { id: line.id } })
      return { ok: false, reason: 'OUT_OF_STOCK' } as const
    }
    await tx.cartItem.update({ where: { id: line.id }, data: { quantity: capped } })
    return capped < Math.min(quantity, MAX_LINE_QUANTITY)
      ? ({ ok: false, reason: 'LIMITED_STOCK', available: capped } as const)
      : ({ ok: true } as const)
  })
}

/**
 * Called at sign-in: the guest cart's lines join the account's cart (or
 * the guest cart becomes the account's cart if it has none).
 */
export async function adoptGuestCart(guestCartId: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const userCart = await tx.cart.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (!userCart) {
      await tx.cart.update({ where: { id: guestCartId }, data: { userId, expiresAt: cartExpiry() } })
      return
    }
    await lockCart(tx, userCart.id)
    const guestItems = await tx.cartItem.findMany({ where: { cartId: guestCartId } })
    for (const g of guestItems) {
      const existing = await tx.cartItem.findFirst({
        where: { cartId: userCart.id, productId: g.productId, variantId: g.variantId },
        select: { id: true, quantity: true },
      })
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(Math.max(existing.quantity, g.quantity), MAX_LINE_QUANTITY) },
        })
      } else {
        await tx.cartItem.create({ data: { cartId: userCart.id, productId: g.productId, variantId: g.variantId, quantity: g.quantity } })
      }
    }
    await tx.cart.delete({ where: { id: guestCartId } })
  })
}

// ------------------------------------------------------------------- view

export type CartLine = {
  itemId: string
  productId: string
  variantId: string | null
  slug: string
  name: string
  variantName: string | null
  sku: string
  imageKey: string | null
  unitPricePaise: number
  compareAtPaise: number | null
  gstRateBp: number
  weightGrams: number
  quantity: number
  available: number
  isDemo: boolean
  /** Why this line cannot be bought as it stands, if at all. */
  problem: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK' | null
}

export async function loadCartLines(cartId: string, client: Tx | typeof db = db): Promise<CartLine[]> {
  const items = await client.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quantity: true,
      productId: true,
      variantId: true,
      product: {
        select: {
          slug: true,
          name: true,
          sku: true,
          status: true,
          isDemo: true,
          pricePaise: true,
          compareAtPaise: true,
          gstRateBp: true,
          weightGrams: true,
          images: { select: { key: true }, orderBy: { position: 'asc' }, take: 1 },
          inventory: { select: { onHand: true, reserved: true } },
        },
      },
      variant: {
        select: {
          name: true,
          sku: true,
          isActive: true,
          pricePaise: true,
          compareAtPaise: true,
          weightGrams: true,
          inventory: { select: { onHand: true, reserved: true } },
        },
      },
    },
  })

  return items.map((i) => {
    const p = i.product
    const v = i.variant
    const inv = i.variantId ? v?.inventory : p.inventory
    const available = inv ? Math.max(0, inv.onHand - inv.reserved) : 0
    const purchasable = p.status === 'PUBLISHED' && (!i.variantId || v?.isActive === true)
    const problem: CartLine['problem'] = !purchasable
      ? 'UNAVAILABLE'
      : available === 0
        ? 'OUT_OF_STOCK'
        : i.quantity > available
          ? 'NOT_ENOUGH_STOCK'
          : null
    return {
      itemId: i.id,
      productId: i.productId,
      variantId: i.variantId,
      slug: p.slug,
      name: p.name,
      variantName: v?.name ?? null,
      sku: v?.sku ?? p.sku,
      imageKey: p.images[0]?.key ?? null,
      unitPricePaise: v?.pricePaise ?? p.pricePaise,
      compareAtPaise: v ? (v.compareAtPaise ?? null) : p.compareAtPaise,
      gstRateBp: p.gstRateBp,
      weightGrams: v?.weightGrams ?? p.weightGrams,
      quantity: i.quantity,
      available,
      isDemo: p.isDemo,
      problem,
    }
  })
}

export async function cartItemCount(cartId: string): Promise<number> {
  const agg = await db.cartItem.aggregate({ where: { cartId }, _sum: { quantity: true } })
  return agg._sum.quantity ?? 0
}

export async function setCartCoupon(cartId: string, couponId: string | null): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { couponId } })
}

export async function getCartCouponCode(cartId: string): Promise<string | null> {
  const cart = await db.cart.findUnique({ where: { id: cartId }, select: { coupon: { select: { code: true } } } })
  return cart?.coupon?.code ?? null
}
