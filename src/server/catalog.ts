// Read-only catalogue queries for the storefront.
//
// Every query uses an explicit `select`, so admin-only fields such as
// costPricePaise can never reach a customer page by accident. Results are
// cached briefly and tagged so the admin panel can refresh them on change.

import { cacheLife, cacheTag } from 'next/cache'
import { db } from './db'

const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  pricePaise: true,
  compareAtPaise: true,
  isDemo: true,
  lowStockThreshold: true,
  images: { select: { key: true, alt: true }, orderBy: { position: 'asc' }, take: 1 },
  inventory: { select: { onHand: true, reserved: true } },
  category: { select: { slug: true, name: true } },
} as const

export type ProductCard = Awaited<ReturnType<typeof listProducts>>[number]

const published = { status: 'PUBLISHED' } as const

export async function listCategories() {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  return db.category.findMany({
    where: { isPublished: true, parentId: null },
    orderBy: { position: 'asc' },
    select: { id: true, slug: true, name: true, nameHi: true, description: true },
  })
}

export async function listProducts(options: { featured?: boolean; take?: number } = {}) {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  return db.product.findMany({
    where: { ...published, ...(options.featured ? { isFeatured: true } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: options.take,
    select: productCardSelect,
  })
}

export async function getCategoryWithProducts(slug: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  return db.category.findFirst({
    where: { slug, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      nameHi: true,
      description: true,
      seoTitle: true,
      seoDescription: true,
      products: {
        where: published,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        select: productCardSelect,
      },
    },
  })
}

export async function getProduct(slug: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  const product = await db.product.findFirst({
    where: { slug, ...published },
    select: {
      ...productCardSelect,
      sku: true,
      description: true,
      material: true,
      shippingNote: true,
      returnEligible: true,
      authenticityNote: true,
      seoTitle: true,
      seoDescription: true,
      categoryId: true,
      images: { select: { key: true, alt: true }, orderBy: { position: 'asc' } },
      attributes: { select: { label: true, value: true }, orderBy: { position: 'asc' } },
    },
  })
  if (!product) return null

  const related = product.categoryId
    ? await db.product.findMany({
        where: { ...published, categoryId: product.categoryId, id: { not: product.id } },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: productCardSelect,
      })
    : []

  return { ...product, related }
}

export async function searchProducts(query: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  const q = query.trim().slice(0, 100)
  if (q.length < 2) return []
  return db.product.findMany({
    where: {
      ...published,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { shortDescription: { contains: q, mode: 'insensitive' } },
        { material: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 48,
    select: productCardSelect,
  })
}

export async function listPublishedLegalPages() {
  'use cache'
  cacheLife('minutes')
  cacheTag('legal')
  return db.legalPage.findMany({
    where: { isPublished: true },
    orderBy: { title: 'asc' },
    select: { slug: true, title: true },
  })
}

export function availableStock(inventory: { onHand: number; reserved: number } | null): number {
  return inventory ? Math.max(0, inventory.onHand - inventory.reserved) : 0
}

/** Everything the sitemap lists. Demo products are left out: they are not real stock. */
export async function listSitemapEntries() {
  'use cache'
  cacheLife('minutes')
  cacheTag('catalog')
  cacheTag('legal')
  const [categories, products, pages] = await Promise.all([
    db.category.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({ where: { ...published, isDemo: false }, select: { slug: true, updatedAt: true } }),
    db.legalPage.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
  ])
  return { categories, products, pages }
}
