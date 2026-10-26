import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireCapability } from '@/server/admin/guard'
import { AdminHeading } from '../../ui'
import { CouponForm } from '../CouponForm'
import { EMPTY_COUPON } from '../values'

export const metadata: Metadata = { title: 'Add coupon' }

export default function NewCouponPage() {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/coupons" className="text-maroon-800 underline underline-offset-2">
          ← All coupons
        </Link>
      </p>
      <AdminHeading title="Add coupon" />
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        <NewCoupon />
      </Suspense>
    </>
  )
}

async function NewCoupon() {
  await requireCapability('coupons.manage')
  return <CouponForm values={EMPTY_COUPON} used={0} />
}
