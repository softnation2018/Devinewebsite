import type { OrderStatus, PaymentStatus, ProductStatus } from '@/generated/prisma/client'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Packing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Not paid',
  AUTHORIZED: 'Authorised',
  PAID: 'Paid',
  FAILED: 'Failed',
  PARTIALLY_REFUNDED: 'Part refunded',
  REFUNDED: 'Refunded',
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'On sale',
  ARCHIVED: 'Archived',
}

const tone: Record<string, string> = {
  DRAFT: 'bg-stone/15 text-charcoal',
  PUBLISHED: 'bg-emerald-100 text-emerald-900',
  ARCHIVED: 'bg-maroon-700/10 text-maroon-800',
  PENDING: 'bg-stone/15 text-charcoal',
  CONFIRMED: 'bg-gold-100 text-charcoal',
  PROCESSING: 'bg-gold-300/40 text-charcoal',
  SHIPPED: 'bg-sky-100 text-sky-900',
  DELIVERED: 'bg-emerald-100 text-emerald-900',
  CANCELLED: 'bg-maroon-700/10 text-maroon-800',
  RETURNED: 'bg-maroon-700/10 text-maroon-800',
  PAID: 'bg-emerald-100 text-emerald-900',
  FAILED: 'bg-maroon-700/10 text-maroon-800',
}

export function Badge({ value, label }: { value: string; label: string }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${tone[value] ?? 'bg-stone/15'}`}>{label}</span>
}

export const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })

export function AdminHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-serif text-3xl text-maroon-900">{title}</h1>
      {children}
    </div>
  )
}
