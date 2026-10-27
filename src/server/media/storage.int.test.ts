import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '../db'
import { mediaStore } from './storage'

const key = `products/it${Date.now()}/photo.webp`

afterAll(async () => {
  await db.mediaObject.deleteMany({ where: { key } })
  await db.$disconnect()
})

describe('database photo store', () => {
  it('keeps, replaces and removes a photo by key', async () => {
    vi.stubEnv('MEDIA_STORAGE', 'db')
    const store = mediaStore()!
    await store.put(key, new Uint8Array([1, 2, 3]), 'image/webp')
    await store.put(key, new Uint8Array([4, 5]), 'image/webp')
    const row = await db.mediaObject.findUniqueOrThrow({ where: { key } })
    expect([...row.bytes]).toEqual([4, 5])
    await store.remove(key)
    expect(await db.mediaObject.count({ where: { key } })).toBe(0)
    await expect(store.put('../etc/passwd', new Uint8Array([1]), 'image/webp')).rejects.toThrow()
    vi.unstubAllEnvs()
  })
})
