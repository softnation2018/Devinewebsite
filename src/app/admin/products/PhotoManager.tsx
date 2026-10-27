'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useRef, useState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, imageAction } from '../actions'
import { photoFiles, uploadPhotos } from './photo-upload'

export type PhotoView = { id: string; url: string; alt: string }

export function PhotoManager({ productId, photos, max }: { productId: string; photos: PhotoView[]; max: number }) {
  const router = useRouter()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problem, setProblem] = useState<string>()
  const [message, setMessage] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)
  const altRef = useRef<HTMLInputElement>(null)
  const room = max - photos.length

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setProblem(undefined)
    setMessage(undefined)
    const files = photoFiles(fileRef.current?.files)
    if (files.length === 0) return setProblem('Choose one or more photos first.')
    if (files.length > room) return setProblem(`You can add ${room} more photo${room === 1 ? '' : 's'} to this product. Choose fewer.`)
    const alt = altRef.current?.value.trim() ?? ''
    setProgress({ done: 0, total: files.length })
    const failed = await uploadPhotos(productId, files, () => alt, (done) => setProgress({ done, total: files.length }))
    setProgress(null)
    form.reset()
    router.refresh()
    const ok = files.length - failed.length
    if (ok) setMessage(`${ok} photo${ok === 1 ? '' : 's'} added.`)
    if (failed.length) setProblem(failed.join(' '))
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
            Add photos (up to {room} more; choose several at once)
          </label>
          <input id="photo-file" ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <label htmlFor="photo-alt" className="block text-sm font-medium">
            Short description (used for every photo in this upload)
          </label>
          <input id="photo-alt" ref={altRef} maxLength={200} placeholder="e.g. Five-faced rudraksha bead, front view" className="w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
          <p className="text-xs text-stone">Use your own photos of the actual product. Helps people using screen readers, and search engines.</p>
          <button type="submit" disabled={!!progress} className="rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory disabled:opacity-60">
            {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : 'Upload photos'}
          </button>
          <FormAlert error={problem} message={message} />
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
