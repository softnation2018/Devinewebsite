// Turning a cart into an order. Everything that decides money or stock
// happens here, on the server, inside one database transaction:
// prices come from the database, stock is locked and reserved, the coupon
// is re-checked under a lock, and totals come from calculateOrderTotals.

import { randomInt } from 'node:crypto'
import type { Prisma } from '@/generated/prisma/client'
import { hashToken, newToken } from '../auth/tokens'
import { db } from '../db'
import { calculateOrderTotals, type PricingResult } from '../pricing'
import type { CommerceSettings } from '../settings'
import type { AddressInput } from './address'
import { type CartLine, loadCartLines } from './cart'
import { checkCoupon, type CouponCheck, normaliseCouponCode } from './coupons'

export type PaymentChoice = 'RAZORPAY' | 'COD'

export type PaymentOptions = { online: boolean; cod: boolean; codReason: string | null }

/** Which payment methods this order total may use. */
export function paymentOptions(totalBeforeCodFeePaise: number, settings: CommerceSettings, onlineConfigured: boolean): PaymentOptions {
  let codReason: string | null = null
  if (!settings.codEnabled) codReason = 'Cash on Delivery is not available at the moment.'
  else if (totalBeforeCodFeePaise < settings.codMinOrderPaise) codReason = 'Cash on Delivery is available on larger orders.'
  else if (settings.codMaxOrderPaise > 0 && totalBeforeCodFeePaise > settings.codMaxOrderPaise)
    codReason = 'Cash on Delivery is not available for orders of this value.'
  return { online: onlineConfigured, cod: codReason === null, codReason }
}

export type CartQuote = {
  lines: CartLine[]
  hasProblems: boolean
  coupon: CouponCheck | null
  totals: PricingResult | null
}

/** Prices a cart for display. The same numbers are recomputed at checkout. */
export async function quoteCart(
  cartId: string,
  opts: { settings: CommerceSettings; paymentMethod: PaymentChoice; couponCode: string | null; userId: string | null; email: string | null },
): Promise<CartQuote> {
  const lines = await loadCartLines(cartId)
  const buyable = lines.filter((l) => l.problem === null)
  if (buyable.length === 0) return { lines, hasProblems: lines.length > 0, coupon: null, totals: null }

  const subtotalPaise = buyable.reduce((a, l) => a + l.unitPricePaise * l.quantity, 0)
  const coupon = opts.couponCode
    ? await checkCoupon(db, opts.couponCode, { subtotalPaise, userId: opts.userId, email: opts.email })
    : null

  const totals = calculateOrderTotals({
    lines: buyable.map((l) => ({ unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBp: l.gstRateBp })),
    coupon: coupon?.ok ? coupon.pricing : null,
    shipping: { flatPaise: opts.settings.shippingFlatPaise, freeAbovePaise: opts.settings.shippingFreeAbovePaise },
    paymentMethod: opts.paymentMethod,
    codFeePaise: opts.settings.codFeePaise,
  })
  return { lines, hasProblems: buyable.length !== lines.length, coupon, totals }
}

// ------------------------------------------------------------- place order

export type PlaceOrderInput = {
  cartId: string
  userId: string | null
  /** Contact email: the account email, or the guest's. */
  email: string
  address: AddressInput
  paymentMethod: PaymentChoice
  couponCode: string | null
  customerNote: string | null
  saveAddress: boolean
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; accessToken: string; totalPaise: number }
  | { ok: false; reason: 'EMPTY_CART' | 'CART_CHANGED' | 'COUPON' | 'PAYMENT_METHOD'; message: string }

class Abort extends Error {
  constructor(public result: Extract<PlaceOrderResult, { ok: false }>) {
    super(result.message)
  }
}

const ORDER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L

/** e.g. DM-261026-7KQ4XM. Random, so order numbers do not reveal sales volume. */
export function newOrderNumber(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000)
  const date = ist.toISOString().slice(2, 10).replaceAll('-', '')
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)]
  return `DM-${date}-${suffix}`
}

export async function placeOrder(
  input: PlaceOrderInput,
  settings: CommerceSettings,
  onlineConfigured: boolean,
): Promise<PlaceOrderResult> {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${input.cartId} FOR UPDATE`
        const lines = await loadCartLines(input.cartId, tx)
        if (lines.length === 0) throw new Abort({ ok: false, reason: 'EMPTY_CART', message: 'Your cart is empty.' })

        // Lock every inventory row this order touches, in a fixed order so
        // two checkouts can never deadlock, then re-check stock under the lock.
        const inventories = await lockInventories(tx, lines)
        for (const line of lines) {
          const inv = inventories.get(line.variantId ?? line.productId)
          const available = inv ? inv.onHand - inv.reserved : 0
          if (line.problem === 'UNAVAILABLE' || available < line.quantity) {
            throw new Abort({
              ok: false,
              reason: 'CART_CHANGED',
              message: 'Some items in your cart have just sold out or changed. Please review your cart.',
            })
          }
        }

        const subtotalPaise = lines.reduce((a, l) => a + l.unitPricePaise * l.quantity, 0)
        let coupon: Extract<CouponCheck, { ok: true }> | null = null
        const couponCode = input.couponCode ? normaliseCouponCode(input.couponCode) : null
        if (couponCode) {
          await tx.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${couponCode} FOR UPDATE`
          const check = await checkCoupon(tx, couponCode, {
            subtotalPaise,
            userId: input.userId,
            email: input.userId ? null : input.email,
          })
          if (!check.ok) throw new Abort({ ok: false, reason: 'COUPON', message: check.message })
          coupon = check
        }

        const pricingLines = lines.map((l) => ({ unitPricePaise: l.unitPricePaise, quantity: l.quantity, gstRateBp: l.gstRateBp }))
        const pricingBase = {
          lines: pricingLines,
          coupon: coupon?.pricing ?? null,
          shipping: { flatPaise: settings.shippingFlatPaise, freeAbovePaise: settings.shippingFreeAbovePaise },
          codFeePaise: settings.codFeePaise,
        }
        const beforeFee = calculateOrderTotals({ ...pricingBase, paymentMethod: 'RAZORPAY' })
        const options = paymentOptions(beforeFee.totalPaise, settings, onlineConfigured)
        if (input.paymentMethod === 'COD' && !options.cod) {
          throw new Abort({ ok: false, reason: 'PAYMENT_METHOD', message: options.codReason ?? 'Cash on Delivery is not available.' })
        }
        if (input.paymentMethod === 'RAZORPAY' && !options.online) {
          throw new Abort({ ok: false, reason: 'PAYMENT_METHOD', message: 'Online payment is not available yet.' })
        }
        const totals = calculateOrderTotals({ ...pricingBase, paymentMethod: input.paymentMethod })

        const accessToken = newToken()
        const isCod = input.paymentMethod === 'COD'
        const frozenAddress = { ...input.address, country: 'IN' }
        const order = await tx.order.create({
          data: {
            orderNumber: newOrderNumber(),
            userId: input.userId,
            guestEmail: input.userId ? null : input.email,
            guestPhone: input.userId ? null : input.address.phone,
            // COD orders are confirmed straight away; online orders wait for
            // a verified payment. Neither is marked paid here.
            status: isCod ? 'CONFIRMED' : 'PENDING',
            confirmedAt: isCod ? new Date() : null,
            paymentStatus: 'PENDING',
            paymentMethod: input.paymentMethod,
            subtotalPaise: totals.subtotalPaise,
            discountPaise: totals.discountPaise,
            shippingPaise: totals.shippingPaise,
            codFeePaise: totals.codFeePaise,
            taxPaise: totals.taxPaise,
            totalPaise: totals.totalPaise,
            couponId: coupon?.id ?? null,
            couponCode: coupon?.code ?? null,
            shippingAddress: frozenAddress,
            billingAddress: frozenAddress,
            customerNote: input.customerNote,
            accessTokenHash: hashToken(accessToken),
            items: {
              create: lines.map((l, i) => ({
                productId: l.productId,
                variantId: l.variantId,
                nameSnapshot: l.name,
                skuSnapshot: l.sku,
                variantSnapshot: l.variantName,
                imageKeySnapshot: l.imageKey,
                quantity: l.quantity,
                unitPricePaise: l.unitPricePaise,
                gstRateBp: l.gstRateBp,
                taxPaise: totals.lineTaxes[i].taxPaise,
                lineTotalPaise: l.unitPricePaise * l.quantity,
                weightGrams: l.weightGrams * l.quantity,
              })),
            },
            ...(isCod
              ? { payments: { create: { provider: 'cod', method: 'COD', status: 'PENDING', amountPaise: totals.totalPaise } } }
              : {}),
          },
          select: { id: true, orderNumber: true },
        })

        for (const line of lines) {
          const inv = inventories.get(line.variantId ?? line.productId)!
          await tx.inventory.update({ where: { id: inv.id }, data: { reserved: { increment: line.quantity } } })
          await tx.inventoryMovement.create({
            data: { inventoryId: inv.id, delta: line.quantity, reason: 'RESERVATION', orderId: order.id, note: 'Reserved (on-hand unchanged)' },
          })
        }

        if (coupon) {
          await tx.coupon.update({ where: { id: coupon.id }, data: { timesUsed: { increment: 1 } } })
          await tx.couponUsage.create({ data: { couponId: coupon.id, userId: input.userId, orderId: order.id } })
        }

        if (input.saveAddress && input.userId) await saveAddressForUser(tx, input.userId, input.address)

        await tx.cartItem.deleteMany({ where: { cartId: input.cartId } })
        await tx.cart.update({ where: { id: input.cartId }, data: { couponId: null } })

        return { ok: true, orderId: order.id, orderNumber: order.orderNumber, accessToken, totalPaise: totals.totalPaise } as const
      },
      { timeout: 15_000 },
    )
  } catch (e) {
    if (e instanceof Abort) return e.result
    throw e
  }
}

type LockedInventory = { id: string; productId: string | null; variantId: string | null; onHand: number; reserved: number }

async function lockInventories(tx: Prisma.TransactionClient, lines: CartLine[]): Promise<Map<string, LockedInventory>> {
  const productIds = lines.filter((l) => !l.variantId).map((l) => l.productId)
  const variantIds = lines.filter((l) => l.variantId).map((l) => l.variantId!)
  const rows = await tx.$queryRaw<LockedInventory[]>`
    SELECT id, "productId", "variantId", "onHand", reserved FROM "Inventory"
    WHERE "productId" = ANY(${productIds}::text[]) OR "variantId" = ANY(${variantIds}::text[])
    ORDER BY id
    FOR UPDATE
  `
  return new Map(rows.map((r) => [(r.variantId ?? r.productId)!, r]))
}

async function saveAddressForUser(tx: Prisma.TransactionClient, userId: string, a: AddressInput) {
  const same = await tx.address.findFirst({
    where: { userId, line1: a.line1, pincode: a.pincode, fullName: a.fullName },
    select: { id: true },
  })
  if (same) return
  const count = await tx.address.count({ where: { userId } })
  await tx.address.create({ data: { userId, ...a, isDefault: count === 0 } })
}

/** An order page is visible to its account holder, or to whoever holds its access token. */
export async function findOrderForViewer(orderNumber: string, viewer: { userId: string | null; accessToken: string | null }) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      accessTokenHash: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      subtotalPaise: true,
      discountPaise: true,
      shippingPaise: true,
      codFeePaise: true,
      taxPaise: true,
      totalPaise: true,
      couponCode: true,
      shippingAddress: true,
      guestEmail: true,
      placedAt: true,
      items: {
        select: { id: true, nameSnapshot: true, variantSnapshot: true, quantity: true, unitPricePaise: true, lineTotalPaise: true },
      },
      // Only booked parcels, and only what the customer needs to follow one.
      shipments: {
        where: { status: { notIn: ['DRAFT', 'REQUESTED', 'FAILED', 'CANCELLED'] }, awbNumber: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
          courierName: true,
          provider: true,
          awbNumber: true,
          trackingUrl: true,
          events: { orderBy: { occurredAt: 'desc' }, take: 20, select: { id: true, status: true, location: true, occurredAt: true } },
        },
      },
    },
  })
  if (!order) return null
  const owns = viewer.userId !== null && order.userId === viewer.userId
  const hasToken = viewer.accessToken !== null && order.accessTokenHash === hashToken(viewer.accessToken)
  if (!owns && !hasToken) return null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessTokenHash, userId, ...visible } = order
  return visible
}
