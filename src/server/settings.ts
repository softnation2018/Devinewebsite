// Store settings the shop needs at runtime. The values live in the
// StoreSetting table; several are placeholders until the owner decides
// them (needsOwnerDecision), and the admin panel will edit them.

import { cacheLife, cacheTag } from 'next/cache'
import { db } from './db'

export type CommerceSettings = {
  shippingFlatPaise: number
  shippingFreeAbovePaise: number | null
  codEnabled: boolean
  codFeePaise: number
  codMinOrderPaise: number
  codMaxOrderPaise: number
}

function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

export function parseCommerceSettings(rows: { key: string; value: unknown }[]): CommerceSettings {
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const freeAbove = v['shipping.freeAbovePaise']
  return {
    shippingFlatPaise: int(v['shipping.flatPaise'], 0),
    shippingFreeAbovePaise: freeAbove === null || freeAbove === undefined ? null : int(freeAbove, 0),
    // COD is off unless the setting says exactly true.
    codEnabled: v['cod.enabled'] === true,
    codFeePaise: int(v['cod.feePaise'], 0),
    codMinOrderPaise: int(v['cod.minOrderPaise'], 0),
    codMaxOrderPaise: int(v['cod.maxOrderPaise'], 0),
  }
}

export async function getCommerceSettings(): Promise<CommerceSettings> {
  'use cache'
  cacheLife('minutes')
  cacheTag('settings')
  const rows = await db.storeSetting.findMany({
    where: { key: { in: ['shipping.flatPaise', 'shipping.freeAbovePaise', 'cod.enabled', 'cod.feePaise', 'cod.minOrderPaise', 'cod.maxOrderPaise'] } },
    select: { key: true, value: true },
  })
  return parseCommerceSettings(rows)
}

/** Online payment is offered only once Razorpay keys are configured. */
export function onlinePaymentAvailable(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}
