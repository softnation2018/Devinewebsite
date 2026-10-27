// Product photos. The browser shrinks each photo before upload (which also
// drops camera metadata such as GPS location); the server still checks the
// file type from its bytes and the size, and never trusts the file name.

import { randomBytes } from 'node:crypto'
import { thumbKey } from '@/lib/media'
import { db } from '../db'
import { mediaStore } from '../media/storage'
import { recordAudit } from './audit'
import type { StaffResult } from './orders'

type Actor = { id: string; ip: string | null }

export const MAX_IMAGES_PER_PRODUCT = 10
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_THUMB_BYTES = 512 * 1024

const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' } as const
type ImageType = keyof typeof TYPES

/** The real type, read from the file's first bytes. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png'
  return null
}

export function listProductImages(productId: string) {
  return db.productImage.findMany({ where: { productId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
}

export async function addProductImage(productId: string, large: Uint8Array, thumb: Uint8Array, alt: string, actor: Actor): Promise<StaffResult> {
  const store = mediaStore()
  if (!store) return { ok: false, error: 'Photo storage is not set up yet, so photos cannot be uploaded.' }
  if (large.length === 0 || large.length > MAX_IMAGE_BYTES || thumb.length === 0 || thumb.length > MAX_THUMB_BYTES) {
    return { ok: false, error: 'The photo is too large. Please try a smaller photo.' }
  }
  const type = sniffImageType(large)
  if (!type || sniffImageType(thumb) !== type) return { ok: false, error: 'Please upload a JPEG, PNG or WebP photo.' }

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, _count: { select: { images: true } } } })
  if (!product) return { ok: false, error: 'Product not found.' }
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) return { ok: false, error: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} photos.` }

  const key = `products/${productId}/${randomBytes(12).toString('hex')}.${TYPES[type]}`
  await store.put(key, large, type)
  await store.put(thumbKey(key), thumb, type)
  try {
    await db.$transaction(async (tx) => {
      const last = await tx.productImage.aggregate({ where: { productId }, _max: { position: true } })
      const img = await tx.productImage.create({ data: { productId, key, alt: alt.trim().slice(0, 200) || null, position: (last._max.position ?? -1) + 1 } })
      await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'product.image.add', entityType: 'Product', entityId: productId, after: { imageId: img.id, key } })
    })
  } catch (e) {
    await Promise.allSettled([store.remove(key), store.remove(thumbKey(key))])
    throw e
  }
  return { ok: true }
}

export async function removeProductImage(imageId: string, actor: Actor): Promise<StaffResult> {
  const img = await db.$transaction(async (tx) => {
    const found = await tx.productImage.findUnique({ where: { id: imageId } })
    if (!found) return null
    await tx.productImage.delete({ where: { id: imageId } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'product.image.remove', entityType: 'Product', entityId: found.productId, before: { imageId, key: found.key } })
    return found
  })
  if (!img) return { ok: false, error: 'Photo not found.' }
  // The record is gone, so the shop no longer shows it; removing the files is best effort.
  const store = mediaStore()
  if (store) await Promise.allSettled([store.remove(img.key), store.remove(thumbKey(img.key))])
  return { ok: true }
}

/** Moves a photo one place earlier or later. The first photo is the main one. */
export async function moveProductImage(imageId: string, direction: -1 | 1, actor: Actor): Promise<StaffResult> {
  return db.$transaction(async (tx) => {
    const img = await tx.productImage.findUnique({ where: { id: imageId }, select: { productId: true } })
    if (!img) return { ok: false as const, error: 'Photo not found.' }
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${img.productId} FOR UPDATE`
    const all = await tx.productImage.findMany({ where: { productId: img.productId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
    const from = all.findIndex((i) => i.id === imageId)
    const to = from + direction
    if (to < 0 || to >= all.length) return { ok: true as const }
    ;[all[from], all[to]] = [all[to], all[from]]
    for (const [position, i] of all.entries()) await tx.productImage.update({ where: { id: i.id }, data: { position } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'product.image.reorder', entityType: 'Product', entityId: img.productId, after: { order: all.map((i) => i.id) } })
    return { ok: true as const }
  })
}

export async function setImageAlt(imageId: string, alt: string, actor: Actor): Promise<StaffResult> {
  return db.$transaction(async (tx) => {
    const img = await tx.productImage.findUnique({ where: { id: imageId }, select: { productId: true, alt: true } })
    if (!img) return { ok: false as const, error: 'Photo not found.' }
    const next = alt.trim().slice(0, 200) || null
    await tx.productImage.update({ where: { id: imageId }, data: { alt: next } })
    await recordAudit(tx, { actorUserId: actor.id, ipAddress: actor.ip, action: 'product.image.alt', entityType: 'Product', entityId: img.productId, before: { alt: img.alt }, after: { alt: next } })
    return { ok: true as const }
  })
}
