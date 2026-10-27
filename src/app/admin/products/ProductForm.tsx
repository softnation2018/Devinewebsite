'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, adjustStockAction, saveProductAction } from '../actions'
import { photoFiles, uploadPhotos } from './photo-upload'

export type ProductFormValues = {
  id: string | null
  name: string
  nameHi: string
  slug: string
  sku: string
  categoryId: string
  shortDescription: string
  description: string
  price: string
  compareAt: string
  costPrice: string
  gstRateBp: number
  hsnCode: string
  weightGrams: string
  lowStockThreshold: string
  material: string
  shippingNote: string
  authenticityNote: string
  seoTitle: string
  seoDescription: string
  returnEligible: boolean
  isFeatured: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'

function Text({ name, label, value, hint, required, area, inputMode, maxLength }: { name: string; label: string; value: string; hint?: string; required?: boolean; area?: number; inputMode?: 'decimal' | 'numeric'; maxLength?: number }) {
  const id = `p-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {area ? (
        <textarea id={id} name={name} defaultValue={value} rows={area} maxLength={maxLength} className={input} aria-describedby={hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} name={name} defaultValue={value} required={required} inputMode={inputMode} maxLength={maxLength} className={input} aria-describedby={hint ? `${id}-hint` : undefined} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone">
          {hint}
        </p>
      )}
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-sm border border-gold-500/30 bg-white p-5 shadow-sm">
      {title && <h2 className="font-serif text-lg text-maroon-900">{title}</h2>}
      {children}
    </section>
  )
}

// Matches MAX_IMAGES_PER_PRODUCT on the server.
const MAX_NEW_PHOTOS = 10

export function ProductForm({
  values,
  categories,
  gstRates,
  showCost,
  isDemo,
}: {
  values: ProductFormValues
  categories: { id: string; name: string }[]
  gstRates: readonly number[]
  showCost: boolean
  isDemo: boolean
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveProductAction, {})
  const v = values
  const router = useRouter()
  // A new product's photos wait here until the product exists, then upload.
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [photoProblem, setPhotoProblem] = useState<string>()
  const started = useRef<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // A new product gets the full page, with status and category on the side.
  const wide = !v.id

  function choosePhotos(list: FileList | null) {
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    const all = photoFiles(list)
    setPhotoProblem(all.length > MAX_NEW_PHOTOS ? `Only the first ${MAX_NEW_PHOTOS} photos will be added.` : undefined)
    setPhotos(all.slice(0, MAX_NEW_PHOTOS).map((file) => ({ file, url: URL.createObjectURL(file) })))
  }

  useEffect(() => {
    const id = state.createdId
    if (!id || started.current === id) return
    started.current = id
    const files = photos.map((p) => p.file)
    const name = (document.getElementById('p-name') as HTMLInputElement | null)?.value ?? ''
    setProgress({ done: 0, total: files.length })
    uploadPhotos(id, files, (_f, i) => (i === 0 ? name : `${name}, photo ${i + 1}`), (done) => setProgress({ done, total: files.length })).then((failed) => {
      if (failed.length) {
        setProgress(null)
        setPhotoProblem(`Product created, but ${failed.length} photo(s) did not upload: ${failed.join(' ')} You can add them on the product page.`)
        return
      }
      router.push(`/admin/products/${id}?created=1`)
    })
  }, [state.createdId, photos, router])

  return (
    // Submitted by hand rather than through the action prop, so a rejected
    // save keeps everything typed instead of resetting the form.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (progress) return
        const data = new FormData(e.currentTarget)
        data.delete('photos')
        if (photos.length) data.set('withPhotos', '1')
        startTransition(() => action(data))
      }}
      className={wide ? 'grid items-start gap-6 lg:grid-cols-[1fr_18rem]' : 'space-y-6'}
    >
      {v.id && <input type="hidden" name="productId" value={v.id} />}

      <div className="space-y-6">
        <Card>
          <Text name="name" label="Title" value={v.name} required maxLength={160} />
          <Text name="description" label="Description" value={v.description} area={8} maxLength={10000} hint="What it is, its size and material, and its traditional significance. Do not promise results such as wealth, marriage, healing or protection." />
          <Text name="shortDescription" label="Short description (optional)" value={v.shortDescription} area={2} maxLength={300} hint="One or two lines shown on product cards." />
        </Card>

        {!v.id && (
          <Card title="Media">
            <label
              htmlFor="p-photos"
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                choosePhotos(e.dataTransfer.files)
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed px-4 py-8 text-center text-sm ${dragging ? 'border-maroon-800 bg-gold-100/50' : 'border-stone/40 bg-ivory/50 hover:border-maroon-800'}`}
            >
              <span className="rounded-sm border border-maroon-900 bg-white px-4 py-2 font-medium text-maroon-900">{photos.length ? 'Change photos' : 'Add photos'}</span>
              <span className="text-stone">or drag and drop up to {MAX_NEW_PHOTOS} photos here</span>
            </label>
            <input id="p-photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choosePhotos(e.currentTarget.files)} />
            {photos.length > 0 && (
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {photos.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a chosen file */}
                    <img src={p.url} alt="" className="aspect-square w-full rounded-sm border border-gold-500/30 object-cover" />
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded-sm bg-gold-100 px-1 text-[10px]">Main</span>}
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(p.url)
                        setPhotos(photos.filter((x) => x !== p))
                      }}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 text-xs shadow"
                      aria-label="Remove this photo"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-stone">The first photo is the main one. Use your own photos of the actual product.</p>
            {photoProblem && <p className="text-sm text-maroon-700">{photoProblem}</p>}
          </Card>
        )}

        <Card title="Pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="price" label="Price (₹, GST included)" value={v.price} required inputMode="decimal" />
            <Text name="compareAt" label="Compare-at price (optional)" value={v.compareAt} inputMode="decimal" hint="A genuine earlier price only; shown struck through." />
            {showCost && <Text name="costPrice" label="Cost per item (₹, staff only)" value={v.costPrice} inputMode="decimal" />}
            <div>
              <label htmlFor="p-gstRateBp" className="block text-sm font-medium">
                GST rate
              </label>
              <select id="p-gstRateBp" name="gstRateBp" defaultValue={String(v.gstRateBp)} className={input}>
                {gstRates.map((r) => (
                  <option key={r} value={r}>
                    {r / 100}%
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone">Confirm the right rate with your accountant.</p>
            </div>
            <Text name="hsnCode" label="HSN code (optional)" value={v.hsnCode} inputMode="numeric" />
          </div>
        </Card>

        <Card title="Inventory">
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="sku" label="SKU (optional)" value={v.sku} hint="Leave empty and one is made from the title." maxLength={40} />
            {!v.id && <Text name="initialStock" label="Quantity in stock" value="0" inputMode="numeric" hint="How many you have now. Change it later under Stock." />}
            <Text name="lowStockThreshold" label="Low-stock alert at" value={v.lowStockThreshold} required inputMode="numeric" />
          </div>
        </Card>

        <Card title="Shipping">
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="weightGrams" label="Packed weight (grams)" value={v.weightGrams} required inputMode="numeric" />
            <Text name="shippingNote" label="Shipping note (optional)" value={v.shippingNote} maxLength={300} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="returnEligible" defaultChecked={v.returnEligible} className="h-4 w-4 accent-maroon-900" />
            Can be returned
          </label>
        </Card>

        <Card title="More details (optional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="material" label="Material" value={v.material} maxLength={200} />
            <Text name="nameHi" label="Title in Hindi" value={v.nameHi} maxLength={160} />
          </div>
          <Text name="authenticityNote" label="Authenticity or sourcing note" value={v.authenticityNote} area={2} maxLength={1000} hint="Only state what you can prove with documents, such as a lab report you hold." />
        </Card>

        <Card title="Search engine listing (optional)">
          <Text name="seoTitle" label="Page title" value={v.seoTitle} maxLength={70} />
          <Text name="seoDescription" label="Page description" value={v.seoDescription} maxLength={160} />
          <Text name="slug" label="Web address" value={v.slug} hint="Made from the title if left empty." maxLength={80} />
        </Card>
      </div>

      <div className={`space-y-6 ${wide ? 'lg:sticky lg:top-4' : ''}`}>
        <Card title="Status">
          <select id="p-status" name="status" defaultValue={v.status} className={input} aria-label="Status">
            <option value="PUBLISHED" disabled={isDemo && v.status !== 'PUBLISHED'}>
              Active (on sale)
            </option>
            <option value="DRAFT">Draft (hidden)</option>
            <option value="ARCHIVED">Archived (hidden, kept for past orders)</option>
          </select>
          {isDemo && <p className="text-xs text-maroon-800">This is demo content. It cannot be put on sale.</p>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isFeatured" defaultChecked={v.isFeatured} className="h-4 w-4 accent-maroon-900" />
            Feature on the home page
          </label>
          <label className="flex items-start gap-2 text-xs text-stone">
            <input type="checkbox" name="claimsConfirmed" className="mt-0.5 h-4 w-4 accent-maroon-900" />
            <span>I hold documents for any authenticity, origin or certification claim in this text (needed only when such a claim is present).</span>
          </label>
        </Card>

        <Card title="Product organization">
          <div>
            <label htmlFor="p-categoryId" className="block text-sm font-medium">
              Category
            </label>
            <select id="p-categoryId" name="categoryId" defaultValue={v.categoryId} className={input}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <div className="space-y-3">
          <FormAlert error={state.error} message={progress ? undefined : state.createdId ? undefined : state.message} />
          <button type="submit" disabled={pending || !!progress} className="w-full rounded-sm bg-maroon-900 px-6 py-3 text-sm tracking-[0.12em] text-ivory uppercase hover:bg-maroon-800 disabled:opacity-60">
            {progress ? `Uploading photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : pending ? 'Saving…' : v.id ? 'Save changes' : 'Save product'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function StockForm({ productId, variantId, reasons }: { productId?: string; variantId?: string; reasons: Record<string, string> }) {
  const [state, action] = useActionState<AdminState, FormData>(adjustStockAction, {})
  // Several stock forms can share a page (one per option), so ids must differ.
  const p = `s-${variantId ?? productId}`
  return (
    <form action={action} className="space-y-3">
      {variantId ? <input type="hidden" name="variantId" value={variantId} /> : <input type="hidden" name="productId" value={productId} />}
      <div>
        <label htmlFor={`${p}-reason`} className="block text-sm font-medium">
          What happened
        </label>
        <select id={`${p}-reason`} name="reason" className={input}>
          {Object.entries(reasons).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${p}-delta`} className="block text-sm font-medium">
          Change in quantity
        </label>
        <input id={`${p}-delta`} name="delta" required inputMode="numeric" placeholder="e.g. 10 or -2" className={input} />
      </div>
      <div>
        <label htmlFor={`${p}-note`} className="block text-sm font-medium">
          Note
        </label>
        <input id={`${p}-note`} name="note" maxLength={300} placeholder="Supplier bill no., count date…" className={input} />
      </div>
      <button type="submit" className="rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory">
        Update stock
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
