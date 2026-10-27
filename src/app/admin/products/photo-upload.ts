'use client'

import { uploadProductImageAction } from '../actions'

/**
 * Redraws the photo at a sensible size. Besides making uploads quick on a
 * phone, this drops the camera's hidden metadata (such as GPS location).
 */
async function shrink(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Some browsers cannot write WebP and quietly return PNG; use JPEG there.
  const webp = await encode('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await encode('image/jpeg')
  if (!jpeg) throw new Error('Could not read this photo.')
  return jpeg
}

/** Photo files the browser can read, in the order chosen. */
export function photoFiles(list: FileList | null | undefined): File[] {
  return [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
}

/**
 * Uploads photos one at a time, each in its own small request, so ten
 * photos never hit the request size limit. Returns one line per failure.
 */
export async function uploadPhotos(productId: string, files: File[], alt: (file: File, i: number) => string, onProgress: (done: number) => void): Promise<string[]> {
  const failed: string[] = []
  for (const [i, file] of files.entries()) {
    try {
      const [large, thumb] = await Promise.all([shrink(file, 1600, 0.85), shrink(file, 600, 0.8)])
      const data = new FormData()
      data.set('productId', productId)
      data.set('alt', alt(file, i))
      data.set('large', large, 'large')
      data.set('thumb', thumb, 'thumb')
      const r = await uploadProductImageAction({}, data)
      if (r.error) failed.push(`${file.name}: ${r.error}`)
    } catch {
      failed.push(`${file.name}: this photo could not be read. Try a JPEG or PNG.`)
    }
    onProgress(i + 1)
  }
  return failed
}
