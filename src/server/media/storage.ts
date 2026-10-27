import 'server-only'
// Where product photos are kept. Three stores share one small interface:
//  - "r2": Cloudflare R2 through its S3-compatible API (for Vercel hosting)
//  - "local": a folder on the server's disk (development, or a VPS with a
//    persistent volume)
//  - "db": rows in the MediaObject table, for a host with neither, like the
//    free Vercel preview. Fine for a small catalogue; R2 for the real shop.
// MEDIA_STORAGE picks one; on Vercel without it, "db". With none, uploads are off.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '../db'
import { sha256Hex, signRequest } from './sigv4'

export type MediaStore = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Keys are made by our code, but are checked anyway before touching disk or a URL. */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9]+(\/[a-z0-9][a-z0-9._-]*)+$/i.test(key) || key.includes('..')) throw new Error('Unsafe media key')
}

// The media folder holds runtime uploads, so the build must not trace into it.
export function localMediaDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || 'storage/media')
}

function localStore(): MediaStore {
  const root = localMediaDir()
  return {
    async put(key, body) {
      assertSafeKey(key)
      const file = path.join(/*turbopackIgnore: true*/ root, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body)
    },
    async remove(key) {
      assertSafeKey(key)
      await rm(path.join(/*turbopackIgnore: true*/ root, key), { force: true })
    },
  }
}

function dbStore(): MediaStore {
  return {
    async put(key, body, contentType) {
      assertSafeKey(key)
      const bytes = Uint8Array.from(body)
      await db.mediaObject.upsert({ where: { key }, create: { key, contentType, bytes }, update: { contentType, bytes } })
    },
    async remove(key) {
      assertSafeKey(key)
      await db.mediaObject.deleteMany({ where: { key } })
    },
  }
}

function r2Store(cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }): MediaStore {
  // Endpoint format from Cloudflare's R2 S3 API documentation.
  const base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/`
  async function send(method: 'PUT' | 'DELETE', key: string, body?: Uint8Array, contentType?: string) {
    assertSafeKey(key)
    const url = new URL(base + key)
    const headers = signRequest({
      method,
      url,
      headers: contentType ? { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' } : {},
      payloadHash: sha256Hex(body ?? ''),
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: 'auto',
      service: 's3',
      date: new Date(),
    })
    const res = await fetch(url, { method, headers, body: body ? Buffer.from(body) : undefined, signal: AbortSignal.timeout(20_000) })
    // DELETE of a missing object is a success in S3 terms (204).
    if (!res.ok) throw new Error(`R2 ${method} failed with HTTP ${res.status}`)
  }
  return {
    put: (key, body, contentType) => send('PUT', key, body, contentType),
    remove: (key) => send('DELETE', key),
  }
}

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  return accountId && accessKeyId && secretAccessKey && bucket && process.env.R2_PUBLIC_URL ? { accountId, accessKeyId, secretAccessKey, bucket } : null
}

export function mediaMode(): 'r2' | 'local' | 'db' | null {
  const m = process.env.MEDIA_STORAGE
  if (m === 'r2') return r2Config() ? 'r2' : null
  if (m === 'local') return 'local'
  if (m === 'db' || (!m && process.env.VERCEL)) return 'db'
  if (!m && process.env.NODE_ENV !== 'production') return 'local'
  return null
}

/** Null when photo storage is not set up; callers say so plainly. */
export function mediaStore(): MediaStore | null {
  const m = mediaMode()
  if (m === 'r2') return r2Store(r2Config()!)
  if (m === 'local') return localStore()
  if (m === 'db') return dbStore()
  return null
}
