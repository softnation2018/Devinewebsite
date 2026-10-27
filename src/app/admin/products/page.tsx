import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import type { ProductStatus } from '@/generated/prisma/client'
import { formatPaise } from '@/lib/money'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'
import { listProductsForStaff } from '@/server/admin/products'
import { AdminHeading, Badge, PRODUCT_STATUS_LABEL } from '../ui'

export const metadata: Metadata = { title: 'Products' }

const STATUSES = Object.keys(PRODUCT_STATUS_LABEL) as ProductStatus[]

export default function ProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      {searchParams.then((sp) => {
        const status = STATUSES.find((s) => s === sp.status)
        const q = typeof sp.q === 'string' ? sp.q : ''
        const page = Number(sp.page) || 1
        return <Products status={status} q={q} page={page} />
      })}
    </Suspense>
  )
}

async function Products({ status, q, page }: { status?: ProductStatus; q: string; page: number }) {
  const user = await requireCapability('products.view')
  const result = await listProductsForStaff({ status, q, page })
  const link = (over: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    const merged = { status, q: q || undefined, page: undefined, ...over }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '') params.set(k, String(v))
    const s = params.toString()
    return `/admin/products${s ? `?${s}` : ''}`
  }

  return (
    <>
      <AdminHeading title="Products">
        {can(user.role, 'products.edit') && (
          <Link href="/admin/products/new" className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory">
            Add product
          </Link>
        )}
      </AdminHeading>
      <div className="space-y-5">
        <form className="flex flex-wrap gap-2" action="/admin/products">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="q" className="sr-only">
            Search products
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or SKU" className="w-72 max-w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm" />
          <button className="rounded-sm bg-maroon-900 px-4 py-2 text-sm text-ivory">Search</button>
        </form>
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
          <Link href={link({ status: undefined })} className={`rounded-sm border px-3 py-1 ${!status ? 'border-maroon-900 bg-maroon-900 text-ivory' : 'border-stone/30'}`}>
            All
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={link({ status: s })} className={`rounded-sm border px-3 py-1 ${status === s ? 'border-maroon-900 bg-maroon-900 text-ivory' : 'border-stone/30'}`}>
              {PRODUCT_STATUS_LABEL[s]}
            </Link>
          ))}
        </nav>

        {result.products.length === 0 ? (
          <p className="text-sm text-stone">No products match.</p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-gold-500/30 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-ivory text-xs text-stone uppercase">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3">SKU</th>
                  <th className="px-3">Category</th>
                  <th className="px-3">Status</th>
                  <th className="px-3 text-right">Price</th>
                  <th className="px-3 text-right">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-500/20">
                {result.products.map((p) => {
                  // A product sold in options counts the stock of its options.
                  const rows = p.variants.length > 0 ? p.variants.map((v) => v.inventory) : [p.inventory]
                  const available = rows.reduce((sum, i) => sum + (i ? i.onHand - i.reserved : 0), 0)
                  const held = rows.reduce((sum, i) => sum + (i?.reserved ?? 0), 0)
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        <Link href={`/admin/products/${p.id}`} className="font-medium text-maroon-800 underline underline-offset-2">
                          {p.name}
                        </Link>
                        {p.isDemo && <span className="ml-2 rounded-sm bg-gold-300/50 px-1.5 text-xs">Demo</span>}
                      </td>
                      <td className="px-3 text-stone">{p.sku}</td>
                      <td className="px-3">{p.category?.name ?? '—'}</td>
                      <td className="px-3">
                        <Badge value={p.status} label={PRODUCT_STATUS_LABEL[p.status]} />
                      </td>
                      <td className="px-3 text-right">{formatPaise(p.pricePaise)}</td>
                      <td className={`px-3 text-right font-medium ${available <= p.lowStockThreshold ? 'text-maroon-700' : ''}`}>
                        {available}
                        {p.variants.length > 0 && <span className="block text-xs font-normal text-stone">across {p.variants.length} options</span>}
                        {held > 0 && <span className="block text-xs font-normal text-stone">{held} held for orders</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {result.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
            {result.page > 1 && <Link href={link({ page: result.page - 1 })}>← Previous</Link>}
            <span className="text-stone">
              Page {result.page} of {result.pages} ({result.total} products)
            </span>
            {result.page < result.pages && <Link href={link({ page: result.page + 1 })}>Next →</Link>}
          </nav>
        )}
      </div>
    </>
  )
}
