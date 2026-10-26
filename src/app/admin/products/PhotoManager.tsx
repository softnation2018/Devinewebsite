'use client'

import { startTransition, useActionState, useRef, useState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, imageAction, uploadProductImageAction } from '../actions'

export type PhotoView = { id: string; url: string; alt: string }

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

export function PhotoManager({ productId, photos, max }: { productId: string; photos: PhotoView[]; max: number }) {
  const [state, upload, uploading] = useActionState<AdminState, FormData>(uploadProductImageAction, {})
  const [problem, setProblem] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)
  const altRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setProblem(undefined)
    const file = fileRef.current?.files?.[0]
    if (!file) return setProblem('Choose a photo first.')
    if (!file.type.startsWith('image/')) return setProblem('That file is not a photo.')
    try {
      const [large, thumb] = await Promise.all([shrink(file, 1600, 0.85), shrink(file, 600, 0.8)])
      const data = new FormData()
      data.set('productId', productId)
      data.set('alt', altRef.current?.value ?? '')
      data.set('large', large, 'large')
      data.set('thumb', thumb, 'thumb')
      startTransition(() => upload(data))
      form.reset()
    } catch {
      setProblem('This photo could not be read. Try a JPEG or PNG.')
    }
  }

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <p className="text-sm text-stone">No photos yet. The shop shows a “Photo coming soon” placeholder.</p>
      ) : (
        <ul className="space-y-3">
          {photos.map((p, i) => (
            <PhotoRow key={p.id} photo={p} first={i === 0} last={i === photos.length - 1} />
          ))}
        </ul>
      )}
      {photos.length < max ? (
        <form onSubmit={onSubmit} className="space-y-2 border-t border-gold-500/20 pt-4">
          <label htmlFor="photo-file" className="block text-sm font-medium">
            Add a photo
          </label>
          <input id="photo-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <label htmlFor="photo-alt" className="block text-sm font-medium">
            Short description of the photo
          </label>
          <input id="photo-alt" ref={altRef} maxLength={200} placeholder="e.g. Five-faced rudraksha bead, front view" className="w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
          <p className="text-xs text-stone">Use your own photos of the actual product. Helps people using screen readers, and search engines.</p>
          <button type="submit" disabled={uploading} className="rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory disabled:opacity-60">
            {uploading ? 'Uploading…' : 'Upload photo'}
          </button>
          <FormAlert error={problem ?? state.error} message={problem ? undefined : state.message} />
        </form>
      ) : (
        <p className="text-xs text-stone">This product has the maximum of {max} photos.</p>
      )}
    </div>
  )
}

function PhotoRow({ photo, first, last }: { photo: PhotoView; first: boolean; last: boolean }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(imageAction, {})
  const btn = 'rounded-sm border border-stone/40 px-2 py-1 text-xs disabled:opacity-40'
  const op = (name: string) => (
    <input type="hidden" name="op" value={name} />
  )
  return (
    <li className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- already resized at upload */}
      <img src={photo.url} alt={photo.alt} className="h-20 w-20 shrink-0 rounded-sm border border-gold-500/30 object-cover" />
      <div className="min-w-0 flex-1 space-y-1.5">
        {first && <span className="inline-block rounded-sm bg-gold-100 px-1.5 text-xs">Main photo</span>}
        <form action={act} className="flex gap-1">
          <input type="hidden" name="imageId" value={photo.id} />
          {op('alt')}
          <label className="sr-only" htmlFor={`alt-${photo.id}`}>
            Photo description
          </label>
          <input id={`alt-${photo.id}`} name="alt" defaultValue={photo.alt} maxLength={200} className="min-w-0 flex-1 rounded-sm border border-stone/40 bg-white px-2 py-1 text-xs" />
          <button disabled={pending} className={btn}>
            Save
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          {(['up', 'down'] as const).map((d) => (
            <form key={d} action={act}>
              <input type="hidden" name="imageId" value={photo.id} />
              {op(d)}
              <button disabled={pending || (d === 'up' ? first : last)} className={btn} aria-label={d === 'up' ? 'Move earlier' : 'Move later'}>
                {d === 'up' ? '↑' : '↓'}
              </button>
            </form>
          ))}
          <form
            action={act}
            onSubmit={(e) => {
              if (!confirm('Remove this photo?')) e.preventDefault()
            }}
          >
            <input type="hidden" name="imageId" value={photo.id} />
            {op('remove')}
            <button disabled={pending} className={`${btn} text-maroon-800`}>
              Remove
            </button>
          </form>
        </div>
        {state.error && <p className="text-xs text-maroon-700">{state.error}</p>}
      </div>
    </li>
  )
}
