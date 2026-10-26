import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd } from '@/components/JsonLd'
import { Price } from '@/components/Price'
import { ProductGrid } from '@/components/ProductCard'
import { absoluteMediaUrl } from '@/lib/media'
import { ProductGallery } from '@/components/ProductImage'
import { SectionHeading } from '@/components/SectionHeading'
import { StockBadge } from '@/components/StockBadge'
import { availableStock, getProduct, listProducts } from '@/server/catalog'
import { MAX_LINE_QUANTITY } from '@/server/shop/cart'
import { AddToCartForm } from '../../cart/AddToCartForm'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function generateStaticParams() {
  const products = await listProducts()
  return products.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps<'/product/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return {}
  const description = product.seoDescription ?? product.shortDescription ?? undefined
  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: { title: product.name, description, type: 'website' },
    // Demo products must never appear in search results.
    robots: product.isDemo ? { index: false, follow: true } : undefined,
  }
}

// Params are awaited inside <Suspense>, as the Cache Components guide
// requires with Partial Prefetching. Awaiting them at the top level broke
// these pages with a 500 when the catalogue cache was refreshed. An unknown
// slug therefore streams the not-found page with a noindex tag (HTTP 200).
export default function ProductPage({ params }: PageProps<'/product/[slug]'>) {
  return (
    <Suspense fallback={<div className="mx-auto h-[36rem] max-w-7xl animate-pulse bg-ivory" aria-hidden="true" />}>
      {params.then(({ slug }) => (
        <ProductPageContent slug={slug} />
      ))}
    </Suspense>
  )
}

async function ProductPageContent({ slug }: { slug: string }) {
  const product = await getProduct(slug)
  if (!product) notFound()

  const available = availableStock(product.inventory)
  const url = `${siteUrl}/product/${product.slug}`

  return (
    <article>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          sku: product.sku,
          description: product.shortDescription ?? undefined,
          material: product.material ?? undefined,
          image: product.images.length ? product.images.map((i) => absoluteMediaUrl(i.key, siteUrl)) : undefined,
          url,
          offers: {
            '@type': 'Offer',
            price: (product.pricePaise / 100).toFixed(2),
            priceCurrency: 'INR',
            availability: available > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url,
          },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
            ...(product.category
              ? [{ '@type': 'ListItem', position: 2, name: product.category.name, item: `${siteUrl}/category/${product.category.slug}` }]
              : []),
            { '@type': 'ListItem', position: product.category ? 3 : 2, name: product.name, item: url },
          ],
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Breadcrumbs
          items={[
            { name: 'Home', href: '/' },
            ...(product.category ? [{ name: product.category.name, href: `/category/${product.category.slug}` }] : []),
            { name: product.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          <div className="self-start overflow-hidden rounded-sm border border-gold-100">
            <ProductGallery name={product.name} images={product.images} />
          </div>

          <div>
            {product.isDemo && (
              <p className="mb-4 border border-dashed border-maroon-800 bg-ivory px-3 py-2 text-xs text-maroon-900">
                Demo product for development. Not a real listing.
              </p>
            )}
            <h1 className="font-serif text-3xl leading-tight text-charcoal sm:text-4xl">{product.name}</h1>
            <p className="mt-1 text-xs tracking-wider text-stone">SKU {product.sku}</p>

            <div className="mt-5">
              <Price pricePaise={product.pricePaise} compareAtPaise={product.compareAtPaise} size="lg" />
            </div>
            <div className="mt-2">
              <StockBadge available={available} lowStockThreshold={product.lowStockThreshold} />
            </div>

            {product.shortDescription && <p className="mt-6 text-base leading-relaxed">{product.shortDescription}</p>}

            {available > 0 ? (
              <AddToCartForm productId={product.id} maxQuantity={Math.min(available, MAX_LINE_QUANTITY)} />
            ) : (
              <button
                type="button"
                disabled
                className="mt-8 w-full cursor-not-allowed rounded-sm bg-stone/40 px-6 py-3.5 text-sm font-semibold tracking-[0.14em] text-ivory uppercase sm:w-auto"
              >
                Sold out
              </button>
            )}

            {product.attributes.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xs tracking-[0.2em] text-maroon-900 uppercase">Specifications</h2>
                <dl className="mt-3 divide-y divide-gold-100 border-y border-gold-100 text-sm">
                  {product.material && (
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-stone">Material</dt>
                      <dd>{product.material}</dd>
                    </div>
                  )}
                  {product.attributes.map((a) => (
                    <div key={a.label} className="flex justify-between gap-4 py-2.5">
                      <dt className="text-stone">{a.label}</dt>
                      <dd className="text-right">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {product.description && (
              <section className="mt-8">
                <h2 className="text-xs tracking-[0.2em] text-maroon-900 uppercase">Description</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed whitespace-pre-line">{product.description}</div>
              </section>
            )}

            <section className="mt-8 space-y-1 text-sm text-stone">
              {product.shippingNote && <p>{product.shippingNote}</p>}
              <p>{product.returnEligible ? 'Eligible for return under our return policy.' : 'This item is not returnable.'}</p>
              {product.authenticityNote && <p>{product.authenticityNote}</p>}
            </section>
          </div>
        </div>
      </div>

      {product.related.length > 0 && (
        <section className="bg-ivory px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <SectionHeading title="You may also like" />
            <ProductGrid products={product.related} />
          </div>
        </section>
      )}
    </article>
  )
}
