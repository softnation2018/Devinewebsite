import { mediaUrl, thumbKey } from '@/lib/media'

type Photo = { key: string; alt: string | null }

// A product's own photo when it has one. Otherwise a neutral placeholder
// that says plainly the photo is missing, rather than using stock imagery.
export function ProductImage({ name, image, size = 'thumb', className = '', priority = false }: { name: string; image?: Photo; size?: 'thumb' | 'large'; className?: string; priority?: boolean }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- photos are resized when uploaded
      <img
        src={mediaUrl(size === 'thumb' ? thumbKey(image.key) : image.key)}
        alt={image.alt ?? name}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`aspect-square w-full bg-ivory object-cover ${className}`}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${name}: photo coming soon`}
      className={`flex aspect-square w-full flex-col items-center justify-center gap-3 bg-ivory text-maroon-800 ${className}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className="h-14 w-14 text-gold-500" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="32" cy="32" r="22" />
        <path d="M32 14l15.6 27H16.4z" />
        <path d="M32 50L16.4 23h31.2z" />
        <circle cx="32" cy="32" r="3" fill="currentColor" />
      </svg>
      <span className="text-xs tracking-[0.2em] text-stone uppercase">Photo coming soon</span>
    </div>
  )
}

/** All of a product's photos, swipeable on phones. */
export function ProductGallery({ name, images }: { name: string; images: Photo[] }) {
  if (images.length <= 1) return <ProductImage name={name} image={images[0]} size="large" priority />
  return (
    <div>
      <ul className="flex snap-x snap-mandatory overflow-x-auto" aria-label={`Photos of ${name}`}>
        {images.map((img, i) => (
          <li key={img.key} className="w-full shrink-0 snap-center">
            <ProductImage name={name} image={img} size="large" priority={i === 0} />
          </li>
        ))}
      </ul>
      <p className="py-2 text-center text-xs text-stone">
        {images.length} photos · swipe to see more
      </p>
    </div>
  )
}
