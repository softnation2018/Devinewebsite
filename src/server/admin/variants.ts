// Variants (sizes, mukhi counts, finishes) of one product, managed by staff.
// Each variant has its own SKU and its own stock record. Variants are
// never deleted, because past orders point at them; staff switch them off.

import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { parseRupeesToPaise } from '@/lib/money'
import { db } from '../db'
import { recordAudit } from './audit'
import type { StaffResult } from './orders'

type Actor = { id: string; ip: string | null }

export const MAX_VARIANTS_PER_PRODUCT = 30

export function listVariantsForStaff(productId: string) {
  return db.productVariant.findMany({
    where: { productId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      name: true,
      pricePaise: true,
      compareAtPaise: true,
      weightGrams: true,
      isActive: true,
      inventory: { select: { onHand: true, reserved: true } },
      _count: { select: { orderItems: true } },
    },
  })
}

const rupees = (label: string) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null
    const p = parseRupeesToPaise(s)
    if (p === null || p <= 0) ctx.addIssue({ code: 'custom', message: `${label}: enter an amount in rupees, like 499 or 499.50.` })
    return p
  })

const variantSchema = z
  .object({
    name: z.string().trim().min(1, 'Name: say what this option is, like “8 mm” or “5 Mukhi”.').max(80, 'Name: at most 80 characters.'),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'SKU: 2 to 40 letters, numbers or dashes.'),
    price: rupees('Price'),
    compareAt: rupees('Compare-at price'),
    weight: z.string().transform((s, ctx) => {
      if (!s.trim()) return null
      const n = Number(s.trim())
      if (!/^\d+$/.test(s.trim()) || n < 1 || n > 50_000) ctx.addIssue({ code: 'custom', message: 'Weight: enter a whole number of grams from 1 to 50000, or leave it empty.' })
      return n
    }),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.compareAt !== null && v.price === null) ctx.addIssue({ code: 'custom', message: 'Set a price for this option before a compare-at price.' })
    if (v.compareAt !== null && v.price !== null && v.compareAt <= v.price) ctx.addIssue({ code: 'custom', message: 'Compare-at price must be higher than the price, or left empty.' })
  })

export type VariantInput = z.infer<typeof variantSchema>

export function parseVariantForm(formData: FormData): { ok: true; value: VariantInput } | { ok: false; error: string } {
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v : ''
  }
  const parsed = variantSchema.safeParse({ name: str('name'), sku: str('sku'), price: str('price'), compareAt: str('compareAt'), weight: str('weight'), isActive: formData.get('isActive') === 'on' })
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' ') }
  return { ok: true, value: parsed.data }
}

function variantData(v: VariantInput) {
  // An empty price or weight means "same as the product".
  return { name: v.name, sku: v.sku, pricePaise: v.price, compareAtPaise: v.compareAt, weightGrams: v.weight, isActive: v.isActive }
}

/** Variant and product SKUs share one namespace, so a label or invoice never means two things. */
async function skuTaken(tx: Prisma.TransactionClient, sku: string, exceptVariantId?: string) {
  const [p, v] = await Promise.all([
    tx.product.findUnique({ where: { sku }, select: { id: true } }),
    tx.productVariant.findFirst({ where: { sku, ...(exceptVariantId ? { id: { not: exceptVariantId } } : {}) }, select: { id: true } }),
  ])
  return Boolean(p || v)
}

function isUnique(e: unknown) {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002'
}

export async function createVariant(productId: string, v: VariantInput, actor: Actor): Promise<StaffResult & { id?: string }> {
  try {
    return await db.$transaction(async (tx) => {
      // Lock the product so two staff adding options at once cannot pass the limit together.
      const [product] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`
      if (!product) return { ok: false as const, error: 'Product not found.' }
      if ((await tx.productVariant.count({ where: { productId } })) >= MAX_VARIANTS_PER_PRODUCT) {
        return { ok: false as const, error: `A product can have at most ${MAX_VARIANTS_PER_PRODUCT} options.` }
      }
      if (await skuTaken(tx, v.sku)) return { ok: false as const, error: 'Another product or option already uses this SKU.' }
      const data = variantData(v)
      const created = await tx.productVariant.create({
        data: { ...data, productId, options: { name: v.name }, inventory: { create: { onHand: 0 } } },
        select: { id: true },
      })
      await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'variant.create', entityType: 'ProductVariant', entityId: created.id, after: { productId, ...data } })
      return { ok: true as const, id: created.id }
    })
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: 'Another product or option already uses this SKU.' }
    throw e
  }
}

export async function updateVariant(variantId: string, v: VariantInput, actor: Actor): Promise<StaffResult> {
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.productVariant.findUnique({ where: { id: variantId } })
      if (!before) return { ok: false as const, error: 'Option not found.' }
      if (v.sku !== before.sku && (await skuTaken(tx, v.sku, variantId))) return { ok: false as const, error: 'Another product or option already uses this SKU.' }
      const data = variantData(v)
      const changed = Object.fromEntries(Object.entries(data).filter(([k, val]) => before[k as keyof typeof before] !== val))
      if (Object.keys(changed).length === 0) return { ok: true as const }
      await tx.productVariant.update({ where: { id: variantId }, data: { ...data, options: { name: v.name } } })
      await recordAudit(tx, {
        actorUserId: actor.id,
        ipAddress: actor.ip,
        action: 'variant.update',
        entityType: 'ProductVariant',
        entityId: variantId,
        before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof typeof before] as Prisma.InputJsonValue])),
        after: changed as Prisma.InputJsonValue,
      })
      return { ok: true as const }
    })
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: 'Another product or option already uses this SKU.' }
    throw e
  }
}
