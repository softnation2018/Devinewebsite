// Serves photos from the local media folder. Only used when MEDIA_STORAGE is
// "local"; with R2, photos are served straight from R2's public address.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { assertSafeKey, localMediaDir } from '@/server/media/storage'

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' }

export async function GET(_req: Request, ctx: RouteContext<'/media/[...key]'>) {
  const local = process.env.MEDIA_STORAGE === 'local' || (!process.env.MEDIA_STORAGE && process.env.NODE_ENV !== 'production')
  const { key: parts } = await ctx.params
  const key = parts.join('/')
  const type = TYPES[path.extname(key)]
  try {
    assertSafeKey(key)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!local || !type) return new Response('Not found', { status: 404 })
  try {
    const body = await readFile(path.join(/*turbopackIgnore: true*/ localMediaDir(), key))
    return new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
