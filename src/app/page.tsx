import Link from 'next/link'
import { ProductGrid } from '@/components/ProductCard'
import { SectionHeading } from '@/components/SectionHeading'
import { listCategories, listProducts } from '@/server/catalog'

export default async function HomePage() {
  const [categories, featured, latest] = await Promise.all([
    listCategories(),
    listProducts({ featured: true, take: 4 }),
    listProducts({ take: 8 }),
  ])

  return (
    <>
      <section className="relative overflow-hidden bg-maroon-900 text-ivory">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_center,var(--color-gold-300)_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="text-xs tracking-[0.35em] text-gold-300 uppercase">Yantras · Rudraksha · Malas · Devotional</p>
          <h1 className="mt-5 font-serif text-4xl leading-tight sm:text-6xl">
            Sacred objects, <span className="text-gold-300">chosen with care</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-ivory/80">
            Traditional spiritual and Vastu products for your home and daily practice, each described
            plainly so you know exactly what you are buying.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/shop"
              className="rounded-sm bg-gold-500 px-7 py-3 text-sm font-semibold tracking-[0.14em] text-maroon-950 uppercase hover:bg-gold-400"
            >
              Shop the collection
            </Link>
            {categories[0] && (
              <Link
                href={`/category/${categories[0].slug}`}
                className="rounded-sm border border-gold-300 px-7 py-3 text-sm font-semibold tracking-[0.14em] text-gold-300 uppercase hover:bg-gold-300/10"
              >
                Explore {categories[0].name}
              </Link>
            )}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="bg-ivory px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionHeading title="Shop by category" />
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/category/${c.slug}`}
                    className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-gold-500/60 bg-white px-4 py-10 text-center transition-colors hover:border-maroon-800 hover:bg-gold-100/40"
                  >
                    <span className="font-serif text-xl text-maroon-900">{c.name}</span>
                    {c.nameHi && (
                      <span lang="hi" className="text-sm text-stone">
                        {c.nameHi}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionHeading title="Featured" subtitle="Selected by the Divine Mantra team." />
            <ProductGrid products={featured} />
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section className="bg-ivory px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionHeading title="New arrivals" />
            <ProductGrid products={latest} />
            <div className="mt-10 text-center">
              <Link
                href="/shop"
                className="inline-block rounded-sm border border-maroon-900 px-7 py-3 text-sm font-semibold tracking-[0.14em] text-maroon-900 uppercase hover:bg-maroon-900 hover:text-ivory"
              >
                View all products
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading title="Our promise" />
          <p className="text-base leading-relaxed text-charcoal">
            We describe every product by what it is: its material, size and traditional significance.
            We do not promise wealth, health, protection or any other outcome, and we will never invent
            reviews, urgency or certifications to make a sale.
          </p>
        </div>
      </section>
    </>
  )
}
