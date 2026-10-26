import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getCoupon } from '@/server/admin/coupons'
import { requireCapability } from '@/server/admin/guard'
import { AdminHeading } from '../../ui'
import { CouponForm } from '../CouponForm'
import { couponFormValues } from '../values'

export const metadata: Metadata = { title: 'Coupon' }

export default function AdminCouponPage({ params, searchParams }: PageProps<'/admin/coupons/[id]'>) {
  return (
    <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
        <CouponDetail id={id} created={sp.created === '1'} />
      ))}
    </Suspense>
  )
}

async function CouponDetail({ id, created }: { id: string; created: boolean }) {
  await requireCapability('coupons.manage')
  const coupon = await getCoupon(id)
  if (!coupon) notFound()
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/coupons" className="text-maroon-800 underline underline-offset-2">
          ← All coupons
        </Link>
      </p>
      <AdminHeading title={coupon.code} />
      {created && (
        <p role="status" className="mb-6 rounded-sm border border-gold-500/50 bg-gold-100 px-4 py-3 text-sm">
          Coupon created.
        </p>
      )}
      {coupon.appliesToCategory && <p className="mb-4 text-sm text-maroon-800">This coupon is limited to one category. Checkout does not accept category coupons yet, so customers cannot use it.</p>}
      <CouponForm values={couponFormValues(coupon)} used={coupon.timesUsed} />
    </>
  )
}
