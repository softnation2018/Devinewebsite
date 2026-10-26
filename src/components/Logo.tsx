import Link from 'next/link'

// PLACEHOLDER. Replace with the official Divine Mantra logo file once it is
// supplied. Do not redesign or approximate the real logo here.
export function Logo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const text = tone === 'light' ? 'text-gold-300' : 'text-maroon-900'
  return (
    <Link
      href="/"
      aria-label="Divine Mantra home"
      title="Logo placeholder: the official Divine Mantra logo goes here"
      data-placeholder="logo"
      className={`inline-flex flex-col items-center leading-none ${text}`}
    >
      <span className="font-serif text-2xl font-semibold tracking-[0.18em] uppercase sm:text-[1.7rem]">
        Divine Mantra
      </span>
      <span className="mt-1 rounded-sm border border-dashed border-current px-1.5 py-px text-[9px] tracking-[0.2em] uppercase opacity-70">
        Logo placeholder
      </span>
    </Link>
  )
}
