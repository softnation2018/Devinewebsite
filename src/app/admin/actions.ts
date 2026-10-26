'use server'

import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { clientIp } from '@/server/auth/session'
import { can } from '@/server/admin/access'
import { createCoupon, parseCouponForm, updateCoupon } from '@/server/admin/coupons'
import { requireCapability } from '@/server/admin/guard'
import { addProductImage, moveProductImage, removeProductImage, setImageAlt } from '@/server/admin/images'
import { cancelOrder, setAdminNote, setOrderStatus } from '@/server/admin/orders'
import { adjustStock, createProduct, MANUAL_STOCK_REASONS, type ManualStockReason, parseProductForm, updateProduct } from '@/server/admin/products'
import { parseSettingInput, saveSetting } from '@/server/admin/settings'

export type AdminState = { error?: string; message?: string }

const id = z.string().min(1).max(40)

export async function setOrderStatusAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('orders.update')
  const parsed = z.object({ orderId: id, to: z.enum(['CONFIRMED', 'PROCESSING']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Invalid request.' }
  const r = await setOrderStatus(parsed.data.orderId, parsed.data.to, { id: user.id, ip: await clientIp() })
  refresh()
  return r.ok ? { message: 'Status updated.' } : { error: r.error }
}

export async function cancelOrderAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('orders.cancel')
  const parsed = z.object({ orderId: id, reason: z.string().max(300) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Invalid request.' }
  const r = await cancelOrder(parsed.data.orderId, parsed.data.reason, { id: user.id, ip: await clientIp() })
  // Stock was released, so storefront stock counts change.
  if (r.ok) updateTag('catalog')
  refresh()
  return r.ok ? { message: 'Order cancelled and stock released.' } : { error: r.error }
}

export async function saveAdminNoteAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('orders.update')
  const parsed = z.object({ orderId: id, note: z.string().max(2000) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Invalid request.' }
  const r = await setAdminNote(parsed.data.orderId, parsed.data.note, { id: user.id, ip: await clientIp() })
  refresh()
  return r.ok ? { message: 'Note saved.' } : { error: r.error }
}

export async function saveSettingAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('settings.edit')
  const key = String(formData.get('key') ?? '')
  const raw = formData.get('value')
  const parsed = parseSettingInput(key, typeof raw === 'string' ? raw : null)
  if (!parsed.ok) return { error: parsed.error }
  await saveSetting(key, parsed.value, { id: user.id, ip: await clientIp() })
  updateTag('settings')
  refresh()
  return { message: 'Saved.' }
}

export async function saveProductAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('products.edit')
  const productId = String(formData.get('productId') ?? '')
  const parsed = parseProductForm(formData)
  if (!parsed.ok) return { error: parsed.error }
  const actor = { id: user.id, ip: await clientIp(), canCost: can(user.role, 'products.cost') }
  if (!productId) {
    const r = await createProduct(parsed.value, actor)
    if (!r.ok) return { error: r.error }
    updateTag('catalog')
    redirect(`/admin/products/${r.id}?created=1`)
  }
  const r = await updateProduct(productId, parsed.value, actor)
  if (!r.ok) return { error: r.error }
  updateTag('catalog')
  refresh()
  return { message: 'Saved.' }
}

export async function adjustStockAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('stock.adjust')
  const parsed = z
    .object({
      productId: id,
      delta: z.string().regex(/^[+-]?\d{1,6}$/, 'Enter a whole number, for example 10 or -2.').transform(Number),
      reason: z.enum(Object.keys(MANUAL_STOCK_REASONS) as [ManualStockReason, ...ManualStockReason[]]),
      note: z.string().max(300),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  const { productId, delta, reason, note } = parsed.data
  const r = await adjustStock(productId, delta, reason, note, { id: user.id, ip: await clientIp() })
  if (!r.ok) return { error: r.error }
  updateTag('catalog')
  refresh()
  return { message: `Stock updated. ${r.onHand} now on hand.` }
}

export async function saveCouponAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('coupons.manage')
  const couponId = String(formData.get('couponId') ?? '')
  const parsed = parseCouponForm(formData)
  if (!parsed.ok) return { error: parsed.error }
  const actor = { id: user.id, ip: await clientIp() }
  if (!couponId) {
    const r = await createCoupon(parsed.value, actor)
    if (!r.ok) return { error: r.error }
    redirect(`/admin/coupons/${r.id}?created=1`)
  }
  const r = await updateCoupon(couponId, parsed.value, actor)
  refresh()
  return r.ok ? { message: 'Saved.' } : { error: r.error }
}

async function fileBytes(v: FormDataEntryValue | null): Promise<Uint8Array> {
  return v instanceof File ? new Uint8Array(await v.arrayBuffer()) : new Uint8Array()
}

export async function uploadProductImageAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('products.edit')
  const productId = id.safeParse(formData.get('productId'))
  if (!productId.success) return { error: 'Invalid request.' }
  const r = await addProductImage(productId.data, await fileBytes(formData.get('large')), await fileBytes(formData.get('thumb')), String(formData.get('alt') ?? ''), {
    id: user.id,
    ip: await clientIp(),
  })
  if (!r.ok) return { error: r.error }
  updateTag('catalog')
  refresh()
  return { message: 'Photo added.' }
}

export async function imageAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireCapability('products.edit')
  const parsed = z
    .object({ imageId: id, op: z.enum(['up', 'down', 'remove', 'alt']), alt: z.string().max(200).optional() })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Invalid request.' }
  const actor = { id: user.id, ip: await clientIp() }
  const { imageId, op, alt } = parsed.data
  const r =
    op === 'remove'
      ? await removeProductImage(imageId, actor)
      : op === 'alt'
        ? await setImageAlt(imageId, alt ?? '', actor)
        : await moveProductImage(imageId, op === 'up' ? -1 : 1, actor)
  if (!r.ok) return { error: r.error }
  updateTag('catalog')
  refresh()
  return { message: op === 'remove' ? 'Photo removed.' : 'Saved.' }
}
