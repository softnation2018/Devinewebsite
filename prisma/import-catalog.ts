// Adds the products in prisma/catalog/products.json, with their photos, to a
// shop that does not have them yet. Runs on every deploy and skips any
// product whose web address already exists, so staff edits are never
// overwritten and a deleted-then-recreated product is left alone.
//
// Products arrive as drafts with no stock (price 0 unless the entry gives
// one): staff set the price and stock in Admin → Products and publish from
// there. An entry marked active goes on sale with its price and stock, and an
// existing product is switched on only while staff have not touched it (still
// a never-published draft at its catalogue price), so their edits always win.
//
// Photos are written straight into the photo store when it is the database
// (Vercel) or a local folder; with R2, upload them in the admin instead.

import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { databaseUrl } from '../src/lib/database-url'

type Entry = {
  folder?: string
  slug: string
  sku: string
  name: string
  nameHi?: string
  category: string
  material?: string
  shortDescription: string
  description: string
  alts: string[]
  price?: number // rupees
  gstRateBp?: number
  weightGrams?: number
  stock?: number
  active?: boolean // put on sale with this price and stock
  replacesPrice?: number // rupees: an earlier catalogue price, moved to price while staff have not changed it
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) })
const root = path.join(process.cwd(), 'prisma', 'catalog')

function photoStore(): 'db' | 'local' | null {
  const m = process.env.MEDIA_STORAGE
  if (m === 'db' || (!m && process.env.VERCEL)) return 'db'
  if (m === 'local' || (!m && process.env.NODE_ENV !== 'production')) return 'local'
  return null
}

async function put(key: string, file: Buffer) {
  const bytes = Uint8Array.from(file)
  if (photoStore() === 'db') {
    await db.mediaObject.upsert({ where: { key }, create: { key, contentType: 'image/webp', bytes }, update: { bytes } })
  } else {
    const file = path.join(path.resolve(process.env.MEDIA_DIR || 'storage/media'), key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
  }
}

async function putOnSale(productId: string, e: Entry) {
  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        pricePaise: Math.round(e.price! * 100),
        ...(e.gstRateBp !== undefined && { gstRateBp: e.gstRateBp }),
        ...(e.weightGrams !== undefined && { weightGrams: e.weightGrams }),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })
    const stock = e.stock ?? 0
    const inv = await tx.inventory.upsert({ where: { productId }, create: { productId, onHand: stock }, update: { onHand: { increment: stock } } })
    if (stock > 0) await tx.inventoryMovement.create({ data: { inventoryId: inv.id, delta: stock, reason: 'PURCHASE', note: 'Opening stock' } })
  })
}

async function main() {
  const entries = JSON.parse(await readFile(path.join(root, 'products.json'), 'utf8')) as Entry[]
  const store = photoStore()
  let added = 0
  let activated = 0
  let repriced = 0
  let failed = 0
  for (const e of entries) {
    try {
      const r = await importOne(e, store)
      if (r.added) added++
      if (r.activated) activated++
      if (r.repriced) repriced++
    } catch (err) {
      // One bad entry must not stop the others, or the deploy.
      failed++
      console.error(`Catalog import: ${e.sku} failed:`, err)
    }
  }
  console.log(
    `Catalog import: ${added} new product(s), ${activated} put on sale, ${repriced} repriced${failed ? `, ${failed} failed` : ''}${store ? '' : ' (photos skipped: upload them in the admin)'}.`,
  )
}

async function importOne(e: Entry, store: 'db' | 'local' | null) {
  const r = { added: false, activated: false, repriced: false }
  const existing = await db.product.findFirst({
    where: { OR: [{ slug: e.slug }, { sku: e.sku }] },
    select: { id: true, status: true, pricePaise: true, publishedAt: true },
  })
  if (existing) {
    const untouchedPrice = existing.pricePaise === 0 || existing.pricePaise === Math.round((e.replacesPrice ?? 0) * 100)
    if (e.active && e.price && existing.status === 'DRAFT' && untouchedPrice && !existing.publishedAt) {
      await putOnSale(existing.id, e)
      r.activated = true
    } else if (e.price && e.replacesPrice && existing.pricePaise === Math.round(e.replacesPrice * 100)) {
      await db.product.update({ where: { id: existing.id }, data: { pricePaise: Math.round(e.price * 100) } })
      r.repriced = true
    }
    return r
  }
  const category = await db.category.findUnique({ where: { slug: e.category }, select: { id: true } })
  const product = await db.product.create({
    data: {
      slug: e.slug,
      sku: e.sku,
      name: e.name,
      nameHi: e.nameHi ?? null,
      categoryId: category?.id ?? null,
      material: e.material || null,
      shortDescription: e.shortDescription,
      description: e.description,
      pricePaise: Math.round((e.price ?? 0) * 100),
      ...(e.gstRateBp !== undefined && { gstRateBp: e.gstRateBp }),
      ...(e.weightGrams !== undefined && { weightGrams: e.weightGrams }),
      status: 'DRAFT',
      inventory: { create: { onHand: 0 } },
    },
    select: { id: true },
  })
  if (store && e.folder) {
    const dir = path.join(root, 'images', e.folder)
    const names = (await readdir(dir)).filter((f) => f.endsWith('.webp') && !f.endsWith('.thumb.webp')).sort()
    for (const [i, file] of names.entries()) {
      const key = `products/${product.id}/${randomBytes(12).toString('hex')}.webp`
      await put(key, await readFile(path.join(dir, file)))
      await put(key.replace(/\.webp$/, '.thumb.webp'), await readFile(path.join(dir, file.replace(/\.webp$/, '.thumb.webp'))))
      await db.productImage.create({ data: { productId: product.id, key, alt: e.alts[i] ?? e.name, position: i } })
    }
  }
  if (e.active && e.price) {
    await putOnSale(product.id, e)
    r.activated = true
  }
  r.added = true
  return r
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
