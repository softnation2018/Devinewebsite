import Link from 'next/link'
import type { ProductCard as ProductCardData } from '@/server/catalog'
import { availableStock } from '@/server/catalog'
import { Price } from './Price'
import { ProductImage } from './ProductImage'

export function ProductCard({ product }: { product: ProductCardData }) {
  const soldOut = availableStock(product.inventory) <= 0
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-sm border border-gold-100 bg-white transition-shadow hover:shadow-[0_6px_24px_-12px_rgba(91,15,26,0.35)]">
      <div className="relative">
        <ProductImage name={product.name} />
        {soldOut && (
          <span className="absolute top-3 left-3 bg-charcoal/85 px-2 py-1 text-[11px] tracking-wider text-white uppercase">
            Sold out
          </span>
        )}
        {product.isDemo && (
          <span className="absolute top-3 right-3 border border-maroon-800 bg-white/90 px-1.5 py-0.5 text-[10px] tracking-wider text-maroon-800 uppercase">
            Demo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-gold-100 p-4">
        {product.category && (
          <p className="text-[11px] tracking-[0.18em] text-stone uppercase">{product.category.name}</p>
        )}
        <h3 className="font-serif text-lg leading-snug text-charcoal">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 group-hover:text-maroon-800">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto pt-2">
          <Price pricePaise={product.pricePaise} compareAtPaise={product.compareAtPaise} />
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  )
}
