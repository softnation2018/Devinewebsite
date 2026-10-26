import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { addProductImage, listProductImages, MAX_IMAGES_PER_PRODUCT, moveProductImage, removeProductImage } from './images'

const tag = `it-img-${Date.now()}`
let dir = ''
let actor: { id: string; ip: string | null }

// Smallest valid-looking files of each kind: only the leading bytes are checked.
const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 '), 1, 2, 3])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])

async function product() {
  return db.product.create({ data: { sku: `${tag}-${Math.random().toString(36).slice(2, 8)}`, slug: `${tag}-${Math.random().toString(36).slice(2, 8)}`, name: 'Photo test', pricePaise: 100 } })
}

async function files() {
  const out: string[] = []
  async function walk(d: string) {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(path.join(d, e.name))
      else out.push(e.name)
    }
  }
  await walk(dir)
  return out
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'dm-media-'))
  process.env.MEDIA_DIR = dir
  const u = await db.user.create({ data: { email: `${tag}@example.test`, role: 'ADMIN' } })
  actor = { id: u.id, ip: null }
})

afterAll(async () => {
  await db.product.deleteMany({ where: { sku: { startsWith: tag } } })
  await db.auditLog.deleteMany({ where: { actorUserId: actor.id } })
  await db.user.deleteMany({ where: { email: { startsWith: tag } } })
  await rm(dir, { recursive: true, force: true })
  await db.$disconnect()
})

describe('product photos', () => {
  it('stores the photo and its small copy, and records it', async () => {
    const p = await product()
    expect(await addProductImage(p.id, webp, webp, ' Front view ', actor)).toEqual({ ok: true })
    const [img] = await listProductImages(p.id)
    expect(img).toMatchObject({ alt: 'Front view', position: 0 })
    expect(img.key).toMatch(new RegExp(`^products/${p.id}/[0-9a-f]{24}\\.webp$`))
    const names = await files()
    expect(names).toContain(path.basename(img.key))
    expect(names).toContain(path.basename(img.key).replace('.webp', '.thumb.webp'))
    expect(await db.auditLog.count({ where: { entityId: p.id, action: 'product.image.add' } })).toBe(1)
  })

  it('refuses files that are not photos, mixed types and oversized files', async () => {
    const p = await product()
    expect(await addProductImage(p.id, new TextEncoder().encode('<svg onload=alert(1)>'), webp, '', actor)).toMatchObject({ ok: false })
    expect(await addProductImage(p.id, webp, png, '', actor)).toMatchObject({ ok: false })
    expect(await addProductImage(p.id, new Uint8Array(4 * 1024 * 1024), webp, '', actor)).toMatchObject({ ok: false })
    expect(await listProductImages(p.id)).toHaveLength(0)
  })

  it('reorders, caps the number of photos, and removes files with the record', async () => {
    const p = await product()
    for (let i = 0; i < MAX_IMAGES_PER_PRODUCT; i++) expect(await addProductImage(p.id, png, png, `p${i}`, actor)).toEqual({ ok: true })
    expect(await addProductImage(p.id, png, png, 'one too many', actor)).toMatchObject({ ok: false })

    const before = await listProductImages(p.id)
    await moveProductImage(before[1].id, -1, actor)
    expect((await listProductImages(p.id)).map((i) => i.alt).slice(0, 3)).toEqual(['p1', 'p0', 'p2'])
    // Moving the first photo earlier does nothing.
    expect(await moveProductImage(before[1].id, -1, actor)).toEqual({ ok: true })

    const gone = before[0]
    expect(await removeProductImage(gone.id, actor)).toEqual({ ok: true })
    expect(await removeProductImage(gone.id, actor)).toMatchObject({ ok: false })
    expect(await files()).not.toContain(path.basename(gone.key))
    expect(await listProductImages(p.id)).toHaveLength(MAX_IMAGES_PER_PRODUCT - 1)
  })
})
