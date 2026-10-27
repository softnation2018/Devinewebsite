// Serves photos from the local media folder or the MediaObject table
// (MEDIA_STORAGE "local" or "db"); with R2, photos are served straight from
// R2's public address.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/server/db'
import { assertSafeKey, localMediaDir, mediaMode } from '@/server/media/storage'

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' }

export async function GET(_req: Request, ctx: RouteContext<'/media/[...key]'>) {
  const mode = mediaMode()
  const { key: parts } = await ctx.params
  const key = parts.join('/')
  const type = TYPES[path.extname(key)]
  try {
    assertSafeKey(key)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if ((mode !== 'local' && mode !== 'db') || !type) return new Response('Not found', { status: 404 })
  // Keys are random and never reused, so a photo can be cached for good.
  const headers = { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }
  try {
    if (mode === 'db') {
      const row = await db.mediaObject.findUnique({ where: { key }, select: { bytes: true } })
      return row ? new Response(Buffer.from(row.bytes), { headers }) : new Response('Not found', { status: 404 })
    }
    const body = await readFile(path.join(/*turbopackIgnore: true*/ localMediaDir(), key))
    return new Response(body, { headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
