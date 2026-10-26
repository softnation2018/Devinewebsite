import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { can } from '@/server/admin/access'
import { requireCapability } from '@/server/admin/guard'
import { GST_RATES_BP, listCategoryOptions } from '@/server/admin/products'
import { AdminHeading } from '../../ui'
import { ProductForm } from '../ProductForm'
import { EMPTY_PRODUCT } from '../values'

export const metadata: Metadata = { title: 'Add product' }

export default function NewProductPage() {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-maroon-800 underline underline-offset-2">
          ← All products
        </Link>
      </p>
      <AdminHeading title="Add product" />
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        <NewProduct />
      </Suspense>
    </>
  )
}

async function NewProduct() {
  const user = await requireCapability('products.edit')
  const categories = await listCategoryOptions()
  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-stone">New products start with no stock. After creating it, add stock on the product page.</p>
      <ProductForm values={EMPTY_PRODUCT} categories={categories} gstRates={GST_RATES_BP} showCost={can(user.role, 'products.cost')} isDemo={false} />
    </>
  )
}
