// Product images are not uploaded yet (image storage arrives with the admin
// panel). Until then every product shows this neutral placeholder, which
// says plainly that the photo is missing rather than using stock imagery.
export function ProductImage({ name, className = '' }: { name: string; className?: string }) {
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
