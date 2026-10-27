import Link from 'next/link'
import { getCurrentUser } from '@/server/auth/session'
import { deliveredOrderWith, getOwnReview, getPublishedReviews } from '@/server/reviews'
import { isInWishlist } from '@/server/wishlist'
import { setWishlistAction } from './actions'
import { ReviewForm } from './ReviewForm'

const dateFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export function Stars({ rating, className = '' }: { rating: number; className?: string }) {
  const full = Math.round(rating)
  return (
    <span className={`text-gold-500 ${className}`} role="img" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(full)}
      <span className="text-stone/30">{'★'.repeat(5 - full)}</span>
    </span>
  )
}

export async function WishlistButton({ productId, slug }: { productId: string; slug: string }) {
  const user = await getCurrentUser()
  const cls = 'inline-flex items-center gap-2 text-sm text-maroon-800 underline underline-offset-2'
  if (!user) {
    return (
      <Link href={`/account/login?next=${encodeURIComponent(`/product/${slug}`)}`} className={cls}>
        <span aria-hidden="true">♡</span> Sign in to save to your wishlist
      </Link>
    )
  }
  const saved = await isInWishlist(user.id, productId)
  return (
    <form action={setWishlistAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="save" value={saved ? '0' : '1'} />
      <button type="submit" className={cls} aria-pressed={saved}>
        <span aria-hidden="true">{saved ? '♥' : '♡'}</span> {saved ? 'Saved to your wishlist' : 'Save to wishlist'}
      </button>
    </form>
  )
}

export async function PublishedReviews({ productId }: { productId: string }) {
  const { count, average, reviews } = await getPublishedReviews(productId)
  return (
    <>
      {count > 0 && average !== null ? (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Stars rating={average} className="text-lg" /> {average} out of 5 · {count} review{count === 1 ? '' : 's'}
        </p>
      ) : (
        <p className="mt-2 text-sm text-stone">No reviews yet.</p>
      )}
      {reviews.length > 0 && (
        <ul className="mt-6 divide-y divide-gold-100 border-y border-gold-100">
          {reviews.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Stars rating={r.rating} />
                {r.title && <span className="font-medium">{r.title}</span>}
              </div>
              {r.body && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{r.body}</p>}
              <p className="mt-2 text-xs text-stone">
                {r.author} · {dateFormat.format(r.createdAt)}
                {r.isVerifiedPurchase && <span className="ml-2 text-maroon-800">✓ Verified purchase</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const STATUS_NOTE = {
  PENDING: 'Your review is waiting to be checked.',
  APPROVED: 'Your review is published.',
  REJECTED: 'Your review was not published. You can edit it and send it again.',
} as const

export async function WriteReview({ productId, slug }: { productId: string; slug: string }) {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <p className="text-sm text-stone">
        Bought this?{' '}
        <Link href={`/account/login?next=${encodeURIComponent(`/product/${slug}`)}`} className="text-maroon-800 underline underline-offset-2">
          Sign in
        </Link>{' '}
        to write a review.
      </p>
    )
  }
  const [orderId, own] = await Promise.all([deliveredOrderWith(user.id, productId), getOwnReview(user.id, productId)])
  if (!orderId) return <p className="text-sm text-stone">Reviews can be written once your order of this product has been delivered.</p>
  return (
    <div className="rounded-sm border border-gold-500/30 bg-white p-5">
      <h3 className="font-serif text-xl text-maroon-900">{own ? 'Your review' : 'Write a review'}</h3>
      {own && <p className="mt-1 text-sm text-stone">{STATUS_NOTE[own.status]}</p>}
      <div className="mt-4">
        <ReviewForm productId={productId} existing={own} />
      </div>
    </div>
  )
}
