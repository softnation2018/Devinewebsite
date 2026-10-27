import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { InventoryReason } from '@/generated/prisma/client'
import { mediaUrl, thumbKey } from '@/lib/media'
import { formatPaise, paiseToRupeeInput } from '@/lib/money'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'
import { listProductImages, MAX_IMAGES_PER_PRODUCT } from '@/server/admin/images'
import { GST_RATES_BP, getProductForStaff, listCategoryOptions, MANUAL_STOCK_REASONS } from '@/server/admin/products'
import { listVariantsForStaff, MAX_VARIANTS_PER_PRODUCT } from '@/server/admin/variants'
import { AdminHeading, Badge, dateTime, PRODUCT_STATUS_LABEL } from '../../ui'
import { PhotoManager } from '../PhotoManager'
import { ProductForm, StockForm } from '../ProductForm'
import { productFormValues } from '../values'
import { VariantForm } from '../VariantForms'

export const metadata: Metadata = { title: 'Product' }

const REASON_LABEL: Record<InventoryReason, string> = {
  PURCHASE: 'Stock received',
  SALE: 'Sold',
  RESERVATION: 'Held for order',
  RELEASE: 'Hold released',
  CANCELLATION: 'Order cancelled',
  RETURN: 'Returned',
  DAMAGE: 'Damaged or lost',
  MANUAL_ADJUSTMENT: 'Count correction',
}

export default function AdminProductPage({ params, searchParams }: PageProps<'/admin/products/[id]'>) {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
        <ProductDetail id={id} created={sp.created === '1'} />
      ))}
    </Suspense>
  )
}

async function ProductDetail({ id, created }: { id: string; created: boolean }) {
  const user = await requireCapability('products.view')
  const [product, categories, images, variants] = await Promise.all([getProductForStaff(id), listCategoryOptions(), listProductImages(id), listVariantsForStaff(id)])
  if (!product) notFound()
  const soldInOptions = variants.some((v) => v.isActive)
  const canEdit = can(user.role, 'products.edit')
  const canStock = can(user.role, 'stock.adjust')
  const inv = product.inventory
  const showCost = can(user.role, 'products.cost')

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-maroon-800 underline underline-offset-2">
          ← All products
        </Link>
      </p>
      <AdminHeading title={product.name}>
        <div className="flex items-center gap-3 text-sm">
          <Badge value={product.status} label={PRODUCT_STATUS_LABEL[product.status]} />
          {product.status === 'PUBLISHED' && (
            <Link href={`/product/${product.slug}`} className="underline underline-offset-2">
              View in shop
            </Link>
          )}
        </div>
      </AdminHeading>
      {created && (
        <p role="status" className="mb-6 rounded-sm border border-gold-500/50 bg-gold-100 px-4 py-3 text-sm">
          Product created. Add stock below before putting it on sale.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Details">
          {can(user.role, 'products.edit') ? (
            <ProductForm values={productFormValues(product, showCost)} categories={categories} gstRates={GST_RATES_BP} showCost={showCost} isDemo={product.isDemo} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-stone">SKU</dt>
                <dd>{product.sku}</dd>
              </div>
              <div>
                <dt className="text-stone">Price</dt>
                <dd>{formatPaise(product.pricePaise)}</dd>
              </div>
              <div>
                <dt className="text-stone">Category</dt>
                <dd>{product.category?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-stone">Weight</dt>
                <dd>{product.weightGrams} g</dd>
              </div>
            </dl>
          )}

          <section aria-labelledby="options-heading" className="mt-10">
            <h2 id="options-heading" className="font-serif text-2xl text-maroon-900">
              Options
            </h2>
            <p className="mt-1 text-sm text-stone">
              Use options when one product comes in sizes or types, such as 5 or 7 Mukhi. Each option has its own SKU and stock. Once a product has an option on sale, customers must choose one, and the product&apos;s own stock is not used.
            </p>
            {variants.length > 0 && (
              <ul className="mt-4 space-y-3">
                {variants.map((v) => {
                  const inv = v.inventory
                  return (
                    <li key={v.id} className="rounded-sm border border-gold-500/30 bg-white">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                          <span>
                            <span className="font-medium">{v.name}</span> <span className="text-stone">· {v.sku}</span>
                            {!v.isActive && <span className="ml-2 text-xs text-maroon-800">(off sale)</span>}
                          </span>
                          <span className="text-stone">
                            {formatPaise(v.pricePaise ?? product.pricePaise)} · {inv ? `${inv.onHand - inv.reserved} available` : 'no stock record'}
                          </span>
                        </summary>
                        <div className="grid gap-6 border-t border-gold-500/20 p-4 lg:grid-cols-2">
                          {canEdit && (
                            <VariantForm
                              productId={product.id}
                              productPrice={paiseToRupeeInput(product.pricePaise)}
                              values={{
                                id: v.id,
                                name: v.name,
                                sku: v.sku,
                                price: v.pricePaise === null ? '' : paiseToRupeeInput(v.pricePaise),
                                compareAt: v.compareAtPaise === null ? '' : paiseToRupeeInput(v.compareAtPaise),
                                weight: v.weightGrams === null ? '' : String(v.weightGrams),
                                isActive: v.isActive,
                              }}
                            />
                          )}
                          {inv && (
                            <div>
                              <p className="mb-3 text-sm">
                                On hand <strong>{inv.onHand}</strong> · Held <strong>{inv.reserved}</strong> · Available <strong>{inv.onHand - inv.reserved}</strong>
                              </p>
                              {canStock && <StockForm variantId={v.id} reasons={MANUAL_STOCK_REASONS} />}
                            </div>
                          )}
                        </div>
                      </details>
                    </li>
                  )
                })}
              </ul>
            )}
            {canEdit && variants.length < MAX_VARIANTS_PER_PRODUCT && (
              <details className="mt-4 rounded-sm border border-dashed border-gold-500/50 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-maroon-900">+ Add an option</summary>
                <div className="border-t border-gold-500/20 p-4">
                  <VariantForm
                    productId={product.id}
                    productPrice={paiseToRupeeInput(product.pricePaise)}
                    values={{ id: null, name: '', sku: `${product.sku}-`, price: '', compareAt: '', weight: '', isActive: true }}
                  />
                </div>
              </details>
            )}
          </section>
        </section>

        <aside className="space-y-6">
          {can(user.role, 'products.edit') && (
            <section className="rounded-sm border border-gold-500/30 bg-white p-4">
              <h2 className="mb-3 font-serif text-xl text-maroon-900">Photos</h2>
              <PhotoManager productId={product.id} photos={images.map((i) => ({ id: i.id, url: mediaUrl(thumbKey(i.key)), alt: i.alt ?? '' }))} max={MAX_IMAGES_PER_PRODUCT} />
            </section>
          )}
          <section className="rounded-sm border border-gold-500/30 bg-white p-4">
            <h2 className="font-serif text-xl text-maroon-900">Stock</h2>
            {soldInOptions ? (
              <p className="mt-2 text-sm text-stone">This product is sold in options. Stock is kept for each option under Options.</p>
            ) : inv ? (
              <>
                <dl className="my-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-xs text-stone">On hand</dt>
                    <dd className="text-2xl">{inv.onHand}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone">Held</dt>
                    <dd className="text-2xl">{inv.reserved}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone">Available</dt>
                    <dd className={`text-2xl ${inv.onHand - inv.reserved <= product.lowStockThreshold ? 'text-maroon-700' : ''}`}>{inv.onHand - inv.reserved}</dd>
                  </div>
                </dl>
                <p className="mb-4 text-xs text-stone">“Held” is stock promised to orders that have not shipped yet. It cannot be removed here.</p>
                {canStock && <StockForm productId={product.id} reasons={MANUAL_STOCK_REASONS} />}
              </>
            ) : (
              <p className="mt-2 text-sm text-stone">No stock record.</p>
            )}
          </section>

          {inv && inv.movements.length > 0 && (
            <section className="rounded-sm border border-gold-500/30 bg-white p-4">
              <h2 className="font-serif text-xl text-maroon-900">Stock history</h2>
              <ul className="mt-3 divide-y divide-gold-500/20 text-sm">
                {inv.movements.map((m, i) => (
                  <li key={i} className="py-2">
                    <div className="flex justify-between gap-2">
                      <span>{REASON_LABEL[m.reason]}</span>
                      <span className="font-medium">{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                    </div>
                    <div className="text-xs text-stone">
                      {dateTime.format(m.createdAt)}
                      {m.order && (
                        <>
                          {' · '}
                          <Link href={`/admin/orders/${m.order.id}`} className="underline">
                            {m.order.orderNumber}
                          </Link>
                        </>
                      )}
                    </div>
                    {m.note && <p className="text-xs text-stone">{m.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
