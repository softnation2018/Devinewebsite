import Link from 'next/link'
import { listCategories } from '@/server/catalog'
import { Logo } from './Logo'

function SearchForm({ id }: { id: string }) {
  return (
    <form action="/search" method="get" role="search" className="flex w-full items-center">
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        name="q"
        type="search"
        minLength={2}
        maxLength={100}
        placeholder="Search yantras, malas, bracelets…"
        className="w-full rounded-l-sm border border-gold-500/50 bg-maroon-950/40 px-3 py-2 text-sm text-ivory placeholder:text-ivory/60 focus:border-gold-300"
      />
      <button
        type="submit"
        className="rounded-r-sm border border-l-0 border-gold-500/50 bg-gold-500 px-3 py-2 text-sm font-medium text-maroon-950 hover:bg-gold-400"
      >
        Search
      </button>
    </form>
  )
}

export async function Header() {
  const categories = await listCategories()

  return (
    <header className="relative z-30 bg-maroon-900 text-ivory">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Mobile menu: a native disclosure, so it works without JavaScript
            and is keyboard and screen-reader accessible by default. */}
        <details className="group lg:hidden">
          <summary className="cursor-pointer list-none rounded-sm p-2 text-gold-300" aria-label="Open menu">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </summary>
          <nav
            aria-label="Mobile"
            className="absolute inset-x-0 top-full z-40 border-t border-gold-500/30 bg-maroon-900 px-4 pt-4 pb-6 shadow-xl"
          >
            <SearchForm id="search-mobile" />
            <ul className="mt-4 divide-y divide-gold-500/20">
              <li>
                <Link href="/shop" className="block py-3 font-serif text-lg">
                  Shop all
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="block py-3 font-serif text-lg">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>

        <Logo />

        <div className="hidden w-80 lg:block">
          <SearchForm id="search-desktop" />
        </div>
        {/* Account, wishlist and cart icons arrive with those features
            (milestones 4 and 5), so nothing here links to a page that
            does not exist yet. */}
        <span className="w-10 lg:hidden" aria-hidden="true" />
      </div>

      <nav aria-label="Main" className="hidden border-t border-gold-500/25 lg:block">
        <ul className="mx-auto flex max-w-7xl items-center justify-center gap-10 px-6 py-3 text-sm tracking-[0.14em] uppercase">
          <li>
            <Link href="/shop" className="hover:text-gold-300">
              Shop all
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/category/${c.slug}`} className="hover:text-gold-300">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
