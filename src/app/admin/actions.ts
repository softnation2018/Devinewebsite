'use server'

import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'
import { clientIp } from '@/server/auth/session'
import { requireCapability } from '@/server/admin/guard'
import { cancelOrder, setAdminNote, setOrderStatus } from '@/server/admin/orders'
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
