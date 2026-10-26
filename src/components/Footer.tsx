import Link from 'next/link'
import { listCategories, listPublishedLegalPages } from '@/server/catalog'
import { Motif } from './Motif'

export async function Footer() {
  const [categories, legalPages] = await Promise.all([listCategories(), listPublishedLegalPages()])

  return (
    <footer className="mt-auto bg-maroon-950 text-ivory/85">
      <div className="mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6">
        <Motif />
        <div className="mt-8 grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-serif text-2xl tracking-[0.14em] text-gold-300 uppercase">Divine Mantra</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed">
              Spiritual, devotional and Vastu products, described honestly.
            </p>
          </div>

          <nav aria-label="Shop">
            <h2 className="text-xs tracking-[0.2em] text-gold-300 uppercase">Shop</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/shop" className="hover:text-gold-300">
                  All products
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

          <nav aria-label="Policies">
            <h2 className="text-xs tracking-[0.2em] text-gold-300 uppercase">Policies</h2>
            {legalPages.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {legalPages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/policies/${p.slug}`} className="hover:text-gold-300">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ivory/60">Policies will appear here once published.</p>
            )}
          </nav>
        </div>

        <p className="mt-10 border-t border-gold-500/20 pt-6 text-xs text-ivory/60">
          © Divine Mantra. Product descriptions reflect traditional significance and are not claims of
          guaranteed outcomes.
        </p>
      </div>
    </footer>
  )
}
