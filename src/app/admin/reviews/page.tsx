import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import type { ReviewStatus } from '@/generated/prisma/client'
import { requireCapability } from '@/server/admin/guard'
import { listReviewsForStaff, REVIEW_STATUS_LABEL } from '@/server/admin/reviews'
import { AdminHeading, Badge, dateTime } from '../ui'
import { ReviewActions } from './ReviewActions'

export const metadata: Metadata = { title: 'Reviews' }

const STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

export default function ReviewsPage({ searchParams }: PageProps<'/admin/reviews'>) {
  return (
    <>
      <AdminHeading title="Reviews" />
      <p className="mb-4 max-w-2xl text-sm text-stone">
        Only customers whose order of the product was delivered can review it. Publish reviews as written; do not edit them. Do not publish a review that claims the product cures, guarantees or causes an outcome.
      </p>
      <Suspense fallback={<p className="text-sm text-stone">Loading…</p>}>
        {searchParams.then((sp) => (
          <Reviews status={STATUSES.includes(sp.status as ReviewStatus) ? (sp.status as ReviewStatus) : 'PENDING'} />
        ))}
      </Suspense>
    </>
  )
}

async function Reviews({ status }: { status: ReviewStatus }) {
  await requireCapability('reviews.moderate')
  const reviews = await listReviewsForStaff(status)
  return (
    <>
      <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/reviews?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className="rounded-sm border border-gold-500/40 px-3 py-1 aria-[current=page]:bg-maroon-900 aria-[current=page]:text-ivory"
          >
            {REVIEW_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      {reviews.length === 0 ? (
        <p className="text-sm text-stone">No reviews here.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-sm border border-gold-500/30 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {'★'.repeat(r.rating)}
                    <span className="text-stone/40">{'★'.repeat(5 - r.rating)}</span> {r.title}
                  </p>
                  <p className="text-stone">
                    {r.product.name} · {r.user.name || r.user.email}
                    {r.order && (
                      <>
                        {' · '}
                        <Link href={`/admin/orders/${r.order.id}`} className="underline">
                          {r.order.orderNumber}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right text-xs text-stone">
                  <Badge value={r.status} label={REVIEW_STATUS_LABEL[r.status]} />
                  <p className="mt-1">{dateTime.format(r.updatedAt)}</p>
                </div>
              </div>
              {r.body && <p className="mt-3 whitespace-pre-wrap">{r.body}</p>}
              {r.claims.forbidden.length > 0 && (
                <p className="mt-3 rounded-sm bg-maroon-700/5 px-3 py-2 text-maroon-800">
                  Contains outcome claims ({r.claims.forbidden.join(', ')}). Publishing it would show this claim on your product page.
                </p>
              )}
              <ReviewActions id={r.id} status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
