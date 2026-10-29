// Editing store settings. Each known key has a kind that decides how the
// form shows it and how input is validated. Saving a value clears the
// "needs owner decision" flag, because a person has now chosen it.

import { Prisma } from '@/generated/prisma/client'
import { parseRupeesToPaise } from '@/lib/money'
import { db } from '../db'
import { recordAudit } from './audit'

export type SettingKind =
  | { type: 'money' }
  | { type: 'moneyOrNone' }
  | { type: 'boolean' }
  | { type: 'days' }
  | { type: 'percent' }
  | { type: 'choice'; options: { value: string; label: string }[] }
  | { type: 'text'; max: number; pattern?: RegExp; patternHint?: string }

export const SETTING_KINDS: Record<string, SettingKind> = {
  'shipping.flatPaise': { type: 'money' },
  'shipping.freeAbovePaise': { type: 'moneyOrNone' },
  'cod.enabled': { type: 'boolean' },
  'cod.feePaise': { type: 'money' },
  'cod.minOrderPaise': { type: 'money' },
  'cod.maxOrderPaise': { type: 'money' },
  'delivery.expressEnabled': { type: 'boolean' },
  'prepaid.expressDiscountPercent': { type: 'percent' },
  'prepaid.standardDiscountPercent': { type: 'percent' },
  'returns.windowDays': { type: 'days' },
  'cancellation.allowedUntil': {
    type: 'choice',
    options: [
      { value: 'BEFORE_PROCESSING', label: 'Until we start packing' },
      { value: 'BEFORE_SHIPMENT', label: 'Until it ships' },
      { value: 'NEVER', label: 'Customers cannot cancel themselves' },
    ],
  },
  'tax.pricesIncludeGst': { type: 'boolean' },
  'business.legalName': { type: 'text', max: 200 },
  'business.address': { type: 'text', max: 500 },
  'business.gstin': {
    type: 'text',
    max: 15,
    pattern: /^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    patternHint: '15 characters, for example 09ABCDE1234F1Z5. Leave empty if not registered.',
  },
  'support.email': { type: 'text', max: 254, pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternHint: 'An email address.' },
  'support.phone': { type: 'text', max: 20, pattern: /^$|^\+?[\d\s-]{8,16}$/, patternHint: 'A phone number.' },
  'support.whatsapp': { type: 'text', max: 20, pattern: /^$|^\+?[\d\s-]{8,16}$/, patternHint: 'A phone number with country code, e.g. +91 98765 43210.' },
  'support.hours': { type: 'text', max: 120 },
}

export async function listSettings() {
  const rows = await db.storeSetting.findMany({ orderBy: { key: 'asc' } })
  return rows.filter((r) => r.key in SETTING_KINDS)
}

/** Turns a submitted form value into the stored JSON value, or an error message. */
export function parseSettingInput(key: string, raw: string | null): { ok: true; value: Prisma.InputJsonValue | null } | { ok: false; error: string } {
  const kind = SETTING_KINDS[key]
  if (!kind) return { ok: false, error: 'Unknown setting.' }
  const v = (raw ?? '').trim()
  switch (kind.type) {
    case 'money': {
      const p = parseRupeesToPaise(v)
      return p === null ? { ok: false, error: 'Enter an amount in rupees, e.g. 79 or 79.50.' } : { ok: true, value: p }
    }
    case 'moneyOrNone': {
      if (v === '') return { ok: true, value: null }
      const p = parseRupeesToPaise(v)
      return p === null ? { ok: false, error: 'Enter an amount in rupees, or leave empty for never.' } : { ok: true, value: p }
    }
    case 'boolean':
      return { ok: true, value: raw === 'on' || raw === 'true' }
    case 'days': {
      const n = Number(v)
      return Number.isInteger(n) && n >= 0 && n <= 365 && v !== '' ? { ok: true, value: n } : { ok: false, error: 'Enter a whole number of days (0 to 365).' }
    }
    case 'percent': {
      const n = Number(v)
      return Number.isInteger(n) && n >= 0 && n <= 90 && v !== '' ? { ok: true, value: n } : { ok: false, error: 'Enter a whole percentage from 0 to 90.' }
    }
    case 'choice':
      return kind.options.some((o) => o.value === v) ? { ok: true, value: v } : { ok: false, error: 'Choose one of the options.' }
    case 'text': {
      const t = key === 'business.gstin' ? v.toUpperCase() : v
      if (t.length > kind.max) return { ok: false, error: `Use at most ${kind.max} characters.` }
      if (kind.pattern && !kind.pattern.test(t)) return { ok: false, error: kind.patternHint ?? 'Check the format.' }
      return { ok: true, value: t }
    }
  }
}

export async function saveSetting(key: string, value: Prisma.InputJsonValue | null, actor: { id: string; ip: string | null }) {
  await db.$transaction(async (tx) => {
    const before = await tx.storeSetting.findUnique({ where: { key } })
    if (!before) throw new Error('Unknown setting')
    // JSON null needs Prisma's sentinel; a bare null would be rejected.
    const json = value === null ? Prisma.JsonNull : value
    await tx.storeSetting.update({ where: { key }, data: { value: json, needsOwnerDecision: false } })
    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: 'setting.update',
      entityType: 'StoreSetting',
      entityId: key,
      before: { value: before.value as Prisma.InputJsonValue, needsOwnerDecision: before.needsOwnerDecision },
      after: { value: value ?? 'none', needsOwnerDecision: false },
    })
  })
}
