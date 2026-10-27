import { paiseToRupeeInput } from '@/lib/money'
import type { getProductForStaff } from '@/server/admin/products'
import type { ProductFormValues } from './ProductForm'

type StaffProduct = NonNullable<Awaited<ReturnType<typeof getProductForStaff>>>

export const EMPTY_PRODUCT: ProductFormValues = {
  id: null,
  name: '',
  nameHi: '',
  slug: '',
  sku: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  price: '',
  compareAt: '',
  costPrice: '',
  gstRateBp: 0,
  hsnCode: '',
  weightGrams: '100',
  lowStockThreshold: '3',
  material: '',
  shippingNote: '',
  authenticityNote: '',
  seoTitle: '',
  seoDescription: '',
  returnEligible: true,
  isFeatured: false,
  status: 'PUBLISHED',
}

const rupees = (p: number | null) => (p === null ? '' : paiseToRupeeInput(p))

export function productFormValues(p: StaffProduct, showCost: boolean): ProductFormValues {
  return {
    id: p.id,
    name: p.name,
    nameHi: p.nameHi ?? '',
    slug: p.slug,
    sku: p.sku,
    categoryId: p.categoryId ?? '',
    shortDescription: p.shortDescription ?? '',
    description: p.description ?? '',
    price: rupees(p.pricePaise),
    compareAt: rupees(p.compareAtPaise),
    costPrice: showCost ? rupees(p.costPricePaise) : '',
    gstRateBp: p.gstRateBp,
    hsnCode: p.hsnCode ?? '',
    weightGrams: String(p.weightGrams),
    lowStockThreshold: String(p.lowStockThreshold),
    material: p.material ?? '',
    shippingNote: p.shippingNote ?? '',
    authenticityNote: p.authenticityNote ?? '',
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    returnEligible: p.returnEligible,
    isFeatured: p.isFeatured,
    status: p.status,
  }
}
