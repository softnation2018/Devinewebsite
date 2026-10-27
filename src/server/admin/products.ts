// Product and stock management for staff. Every change is written together
// with an audit-log row. Stock only ever moves through adjustStock, which
// locks the inventory row and records a movement.

import { z } from 'zod'
import type { InventoryReason, Prisma, ProductStatus } from '@/generated/prisma/client'
import { parseRupeesToPaise } from '@/lib/money'
import { db } from '../db'
import { recordAudit } from './audit'
import type { StaffResult } from './orders'

type Actor = { id: string; ip: string | null }
const PAGE_SIZE = 25

export const GST_RATES_BP = [0, 300, 500, 1200, 1800, 2800] as const

export async function listProductsForStaff(opts: { status?: ProductStatus; q?: string; page?: number }) {
  const q = opts.q?.trim().slice(0, 100)
  const where: Prisma.ProductWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}),
  }
  const page = Math.max(1, opts.page ?? 1)
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sku: true,
        name: true,
        status: true,
        isDemo: true,
        pricePaise: true,
        lowStockThreshold: true,
        category: { select: { name: true } },
        inventory: { select: { onHand: true, reserved: true } },
        variants: { where: { isActive: true }, select: { inventory: { select: { onHand: true, reserved: true } } } },
      },
    }),
  ])
  return { products, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function getProductForStaff(id: string) {
  return db.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      inventory: {
        include: {
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { delta: true, reason: true, note: true, createdAt: true, order: { select: { id: true, orderNumber: true } } },
          },
        },
      },
      _count: { select: { variants: true, orderItems: true } },
    },
  })
}

export function listCategoryOptions() {
  return db.category.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true } })
}

// ------------------------------------------------------------------ claims

/**
 * Promises of an outcome. The shop never makes these, so a product that
 * contains one cannot be published until it is reworded.
 */
const FORBIDDEN_CLAIMS = [
  /\bguarantee[ds]?\b/i,
  /\bcures?\b|\bcured\b/i,
  /\bmiracle/i,
  /\b100\s*%\s*(result|effective|success|working)/i,
  /\bassured\s+(result|success|benefit)/i,
]

/**
 * Claims of authenticity, origin or certification. These may be true, but
 * only staff holding the evidence may publish them, so publishing asks for
 * an explicit confirmation each time.
 */
const VERIFIABLE_CLAIMS = [/\bcertif\w*/i, /\blab[-\s]?tested\b/i, /\bauthentic\b/i, /\boriginal\b/i, /\bgenuine\b/i, /\benergi[sz]ed\b/i, /\babhimantrit\b/i, /\bfrom\s+nepal\b/i]

export function findClaims(text: string) {
  const match = (list: RegExp[]) => [...new Set(list.flatMap((r) => text.match(r)?.[0].toLowerCase() ?? []))]
  return { forbidden: match(FORBIDDEN_CLAIMS), verifiable: match(VERIFIABLE_CLAIMS) }
}

// ------------------------------------------------------------------- input

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)

const rupees = (label: string) =>
  z.string().transform((s, ctx) => {
    if (!s.trim()) return null
    const p = parseRupeesToPaise(s)
    if (p === null) ctx.addIssue({ code: 'custom', message: `${label}: enter an amount in rupees, like 499 or 499.50.` })
    return p
  })

const whole = (label: string, min: number, max: number) =>
  z.string().transform((s, ctx) => {
    const n = Number(s.trim())
    if (!/^\d+$/.test(s.trim()) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: `${label}: enter a whole number from ${min} to ${max}.` })
      return min
    }
    return n
  })

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Name: at least 2 characters.').max(160),
    nameHi: optionalText(160),
    slug: z.string().trim().max(80),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'SKU: 2 to 40 letters, numbers or dashes.'),
    categoryId: optionalText(40),
    shortDescription: optionalText(300),
    description: optionalText(10_000),
    price: rupees('Price'),
    compareAt: rupees('Compare-at price'),
    costPrice: rupees('Cost price'),
    gstRateBp: z.coerce.number().refine((n) => (GST_RATES_BP as readonly number[]).includes(n), 'Choose a GST rate.'),
    hsnCode: z
      .string()
      .trim()
      .regex(/^(\d{4}|\d{6}|\d{8})?$/, 'HSN code: 4, 6 or 8 digits.')
      .transform((s) => s || null),
    weightGrams: whole('Weight', 1, 50_000),
    lowStockThreshold: whole('Low-stock alert', 0, 1000),
    material: optionalText(200),
    shippingNote: optionalText(300),
    authenticityNote: optionalText(1000),
    seoTitle: optionalText(70),
    seoDescription: optionalText(160),
    returnEligible: z.boolean(),
    isFeatured: z.boolean(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    claimsConfirmed: z.boolean(),
  })
  .transform((v, ctx) => {
    const slug = slugify(v.slug || v.name)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) ctx.addIssue({ code: 'custom', message: 'Web address: use letters, numbers and dashes.' })
    if (v.price === null || v.price <= 0) ctx.addIssue({ code: 'custom', message: 'Price: enter a price above zero.' })
    if (v.compareAt !== null && v.price !== null && v.compareAt <= v.price) {
      ctx.addIssue({ code: 'custom', message: 'Compare-at price must be higher than the price, or left empty.' })
    }
    return { ...v, slug, pricePaise: v.price ?? 0 }
  })

export type ProductInput = z.infer<typeof productSchema>

export function parseProductForm(formData: FormData): { ok: true; value: ProductInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(formData)
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')
  const parsed = productSchema.safeParse({
    ...Object.fromEntries(
      ['name', 'nameHi', 'slug', 'sku', 'categoryId', 'shortDescription', 'description', 'price', 'compareAt', 'costPrice', 'gstRateBp', 'hsnCode', 'weightGrams', 'lowStockThreshold', 'material', 'shippingNote', 'authenticityNote', 'seoTitle', 'seoDescription', 'status'].map((k) => [k, str(k)]),
    ),
    returnEligible: raw.returnEligible === 'on',
    isFeatured: raw.isFeatured === 'on',
    claimsConfirmed: raw.claimsConfirmed === 'on',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' ') }
  return { ok: true, value: parsed.data }
}

function publishCheck(v: ProductInput): string | null {
  if (v.status !== 'PUBLISHED') return null
  const text = [v.name, v.nameHi, v.shortDescription, v.description, v.authenticityNote, v.seoTitle, v.seoDescription].filter(Boolean).join('\n')
  const claims = findClaims(text)
  if (claims.forbidden.length) {
    return `This text promises an outcome ("${claims.forbidden.join('", "')}"). The shop does not make such promises; please reword it before publishing.`
  }
  if (claims.verifiable.length && !v.claimsConfirmed) {
    return `This text makes a claim that needs evidence ("${claims.verifiable.join('", "')}"). Tick the confirmation box only if you hold the documents, or reword it.`
  }
  return null
}

function productData(v: ProductInput, canCost: boolean) {
  return {
    name: v.name,
    nameHi: v.nameHi,
    slug: v.slug,
    sku: v.sku,
    categoryId: v.categoryId,
    shortDescription: v.shortDescription,
    description: v.description,
    pricePaise: v.pricePaise,
    compareAtPaise: v.compareAt,
    ...(canCost ? { costPricePaise: v.costPrice } : {}),
    gstRateBp: v.gstRateBp,
    hsnCode: v.hsnCode,
    weightGrams: v.weightGrams,
    lowStockThreshold: v.lowStockThreshold,
    material: v.material,
    shippingNote: v.shippingNote,
    authenticityNote: v.authenticityNote,
    seoTitle: v.seoTitle,
    seoDescription: v.seoDescription,
    returnEligible: v.returnEligible,
    isFeatured: v.isFeatured,
    status: v.status,
  }
}

function uniqueError(e: unknown): string | null {
  if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') {
    const target = JSON.stringify((e as { meta?: unknown }).meta ?? '')
    if (target.includes('sku')) return 'Another product already uses this SKU.'
    if (target.includes('slug')) return 'Another product already uses this web address.'
    return 'Another product already uses this SKU or web address.'
  }
  return null
}

export async function createProduct(v: ProductInput, actor: Actor & { canCost: boolean }): Promise<StaffResult & { id?: string }> {
  const problem = publishCheck(v)
  if (problem) return { ok: false, error: problem }
  if (v.categoryId && !(await db.category.findUnique({ where: { id: v.categoryId }, select: { id: true } }))) {
    return { ok: false, error: 'Choose a category from the list.' }
  }
  try {
    return await db.$transaction(async (tx) => {
      const data = productData(v, actor.canCost)
      const p = await tx.product.create({
        data: { ...data, publishedAt: v.status === 'PUBLISHED' ? new Date() : null, inventory: { create: { onHand: 0 } } },
        select: { id: true },
      })
      await recordAudit(tx, {
        actorUserId: actor.id,
        ipAddress: actor.ip,
        action: 'product.create',
        entityType: 'Product',
        entityId: p.id,
        after: { ...data, ...(v.status === 'PUBLISHED' && v.claimsConfirmed ? { claimsConfirmed: true } : {}) },
      })
      return { ok: true as const, id: p.id }
    })
  } catch (e) {
    const msg = uniqueError(e)
    if (msg) return { ok: false, error: msg }
    throw e
  }
}

export async function updateProduct(id: string, v: ProductInput, actor: Actor & { canCost: boolean }): Promise<StaffResult> {
  const problem = publishCheck(v)
  if (problem) return { ok: false, error: problem }
  if (v.categoryId && !(await db.category.findUnique({ where: { id: v.categoryId }, select: { id: true } }))) {
    return { ok: false, error: 'Choose a category from the list.' }
  }
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } })
      if (!before) return { ok: false as const, error: 'Product not found.' }
      if (before.isDemo && v.status === 'PUBLISHED' && before.status !== 'PUBLISHED') {
        // Demo products exist only to show the layout; they are never sold.
        return { ok: false as const, error: 'Demo products cannot be published. Create a real product instead.' }
      }
      const data = productData(v, actor.canCost)
      const changed = Object.fromEntries(Object.entries(data).filter(([k, val]) => before[k as keyof typeof before] !== val))
      if (Object.keys(changed).length === 0) return { ok: true as const }
      await tx.product.update({
        where: { id },
        data: { ...data, ...(v.status === 'PUBLISHED' && !before.publishedAt ? { publishedAt: new Date() } : {}) },
      })
      await recordAudit(tx, {
        actorUserId: actor.id,
        ipAddress: actor.ip,
        action: 'product.update',
        entityType: 'Product',
        entityId: id,
        before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof typeof before] as Prisma.InputJsonValue])),
        after: { ...changed, ...(v.status === 'PUBLISHED' && v.claimsConfirmed ? { claimsConfirmed: true } : {}) } as Prisma.InputJsonValue,
      })
      return { ok: true as const }
    })
  } catch (e) {
    const msg = uniqueError(e)
    if (msg) return { ok: false, error: msg }
    throw e
  }
}

// ------------------------------------------------------------------- stock

/** Reasons staff may give by hand. Sales, reservations and releases come from orders. */
export const MANUAL_STOCK_REASONS = {
  PURCHASE: 'New stock received',
  RETURN: 'Returned item back in stock',
  DAMAGE: 'Damaged or lost',
  MANUAL_ADJUSTMENT: 'Stock count correction',
} as const satisfies Partial<Record<InventoryReason, string>>

export type ManualStockReason = keyof typeof MANUAL_STOCK_REASONS

/** A simple product's own stock, or one variant's. */
export type StockTarget = { productId: string } | { variantId: string }

/**
 * Changes the stock on hand of a simple product or of one variant. The row is locked so a
 * concurrent checkout cannot interleave, and stock already promised to
 * open orders (reserved) can never be taken away.
 */
export async function adjustStock(
  target: StockTarget,
  delta: number,
  reason: ManualStockReason,
  note: string,
  actor: Actor,
): Promise<StaffResult & { onHand?: number }> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) return { ok: false, error: 'Enter a whole number other than zero.' }
  if ((reason === 'PURCHASE' || reason === 'RETURN') && delta < 0) return { ok: false, error: 'Received or returned stock must be a positive number.' }
  if (reason === 'DAMAGE' && delta > 0) return { ok: false, error: 'Damaged or lost stock must be a negative number.' }
  const why = note.trim().slice(0, 300)
  if (reason === 'MANUAL_ADJUSTMENT' && !why) return { ok: false, error: 'Please say why the count is being corrected.' }

  return db.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: target, select: { id: true } })
    if (!inv) return { ok: false as const, error: 'This item has no stock record.' }
    const [row] = await tx.$queryRaw<{ onHand: number; reserved: number }[]>`
      SELECT "onHand", "reserved" FROM "Inventory" WHERE id = ${inv.id} FOR UPDATE`
    const onHand = row.onHand + delta
    if (onHand < row.reserved) {
      return {
        ok: false as const,
        error:
          onHand < 0
            ? `Only ${row.onHand} on hand; cannot remove ${-delta}.`
            : `${row.reserved} of the ${row.onHand} on hand are promised to open orders, so at most ${row.onHand - row.reserved} can be removed.`,
      }
    }
    await tx.inventory.update({ where: { id: inv.id }, data: { onHand } })
    await tx.inventoryMovement.create({ data: { inventoryId: inv.id, delta, reason, note: why || null, actorUserId: actor.id } })
    await recordAudit(tx, {
      actorUserId: actor.id,
      ipAddress: actor.ip,
      action: 'stock.adjust',
      entityType: 'variantId' in target ? 'ProductVariant' : 'Product',
      entityId: 'variantId' in target ? target.variantId : target.productId,
      before: { onHand: row.onHand },
      after: { onHand, delta, reason, note: why || null },
    })
    return { ok: true as const, onHand }
  })
}
