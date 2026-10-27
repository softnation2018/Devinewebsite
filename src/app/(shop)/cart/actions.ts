'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/server/auth/session'
import { addToCart, getCartCouponCode, loadCartLines, MAX_LINE_QUANTITY, setCartCoupon, setLineQuantity } from '@/server/shop/cart'
import { currentCartId, ensureCartId } from '@/server/shop/cart-session'
import { checkCoupon } from '@/server/shop/coupons'
import { db } from '@/server/db'

export type CartActionState = { error?: string; message?: string; added?: boolean }

const id = z.string().min(1).max(40)
const quantity = z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY)

function changeMessage(result: Awaited<ReturnType<typeof addToCart>>): CartActionState {
  if (result.ok) return {}
  if (result.reason === 'OUT_OF_STOCK') return { error: 'Sorry, this item has just sold out.' }
  if (result.reason === 'LIMITED_STOCK') return { error: `Only ${result.available} available, so your cart has been set to that.` }
  return { error: 'This item is no longer available.' }
}

export async function addToCartAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  const parsed = z
    .object({ productId: id, variantId: id.optional(), quantity: quantity.min(1) })
    .safeParse({
      productId: formData.get('productId'),
      variantId: formData.get('variantId') || undefined,
      quantity: formData.get('quantity') ?? 1,
    })
  if (!parsed.success) return { error: 'Please choose a quantity between 1 and 10.' }

  const cartId = await ensureCartId()
  const result = await addToCart(cartId, parsed.data.productId, parsed.data.variantId ?? null, parsed.data.quantity)
  refresh()
  if (result.ok) return { added: true, message: 'Added to your cart.' }
  return { ...changeMessage(result), added: result.reason === 'LIMITED_STOCK' }
}

export async function updateLineAction(formData: FormData): Promise<void> {
  const parsed = z.object({ itemId: id, quantity }).safeParse({ itemId: formData.get('itemId'), quantity: formData.get('quantity') })
  const cartId = await currentCartId()
  if (!parsed.success || !cartId) return
  await setLineQuantity(cartId, parsed.data.itemId, parsed.data.quantity)
  refresh()
}

export async function applyCouponAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  const code = String(formData.get('code') ?? '')
  const cartId = await currentCartId()
  if (!cartId) return { error: 'Your cart is empty.' }
  if (!code.trim()) return { error: 'Enter a code.' }

  const lines = (await loadCartLines(cartId)).filter((l) => l.problem === null)
  const user = await getCurrentUser()
  const check = await checkCoupon(db, code, { lines, userId: user?.id ?? null, email: null })
  if (!check.ok) return { error: check.message }
  await setCartCoupon(cartId, check.id)
  refresh()
  return { message: check.categoryName ? `Code ${check.code} applied to ${check.categoryName} items.` : `Code ${check.code} applied.` }
}

export async function removeCouponAction(): Promise<void> {
  const cartId = await currentCartId()
  if (cartId && (await getCartCouponCode(cartId))) await setCartCoupon(cartId, null)
  refresh()
}
