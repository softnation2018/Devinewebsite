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
  expressEnabled: boolean
  /** Basis points: 1500 = 15% */
  expressPrepaidDiscountBp: number
  standardPrepaidDiscountBp: number
}

function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

/** A stored whole percentage as basis points; anything unexpected means no discount. */
function percentBp(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 90 ? value * 100 : 0
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
    expressEnabled: v['delivery.expressEnabled'] === true,
    expressPrepaidDiscountBp: percentBp(v['prepaid.expressDiscountPercent']),
    standardPrepaidDiscountBp: percentBp(v['prepaid.standardDiscountPercent']),
  }
}

export async function getCommerceSettings(): Promise<CommerceSettings> {
  'use cache'
  cacheLife('minutes')
  cacheTag('settings')
  const rows = await db.storeSetting.findMany({
    where: { key: { in: ['shipping.flatPaise', 'shipping.freeAbovePaise', 'cod.enabled', 'cod.feePaise', 'cod.minOrderPaise', 'cod.maxOrderPaise', 'delivery.expressEnabled', 'prepaid.expressDiscountPercent', 'prepaid.standardDiscountPercent'] } },
    select: { key: true, value: true },
  })
  return parseCommerceSettings(rows)
}

/** Online payment is offered only once a payment gateway's keys are configured (Razorpay today). */
export function onlinePaymentAvailable(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

export type SupportSettings = { email: string; phone: string; whatsapp: string; hours: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Contact details the owner entered in Admin → Settings. Empty strings mean "not set": show nothing. */
export function parseSupportSettings(rows: { key: string; value: unknown }[]): SupportSettings {
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    email: text(v['support.email']),
    phone: text(v['support.phone']),
    whatsapp: text(v['support.whatsapp']),
    hours: text(v['support.hours']),
  }
}

export async function getSupportSettings(): Promise<SupportSettings> {
  'use cache'
  cacheLife('minutes')
  cacheTag('settings')
  const rows = await db.storeSetting.findMany({
    where: { key: { in: ['support.email', 'support.phone', 'support.whatsapp', 'support.hours'] } },
    select: { key: true, value: true },
  })
  return parseSupportSettings(rows)
}

/** wa.me wants digits only, with the country code. A 10-digit number is taken as Indian. */
export function whatsappLink(number: string): string | null {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 10) return `https://wa.me/91${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `https://wa.me/${digits}`
  return null
}

export type CancellationRule = 'BEFORE_PROCESSING' | 'BEFORE_SHIPMENT' | 'NEVER'

/** Until when customers may cancel themselves (Admin → Settings). Anything unexpected means "never". */
export async function getCancellationRule(): Promise<CancellationRule> {
  'use cache'
  cacheLife('minutes')
  cacheTag('settings')
  const row = await db.storeSetting.findUnique({ where: { key: 'cancellation.allowedUntil' }, select: { value: true } })
  return row?.value === 'BEFORE_PROCESSING' || row?.value === 'BEFORE_SHIPMENT' ? row.value : 'NEVER'
}

/** Days after delivery a customer may ask for a return (Admin → Settings). 0 or unset: no online return requests. */
export async function getReturnWindowDays(): Promise<number> {
  'use cache'
  cacheLife('minutes')
  cacheTag('settings')
  const row = await db.storeSetting.findUnique({ where: { key: 'returns.windowDays' }, select: { value: true } })
  return int(row?.value, 0)
}
