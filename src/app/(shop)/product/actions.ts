'use server'

import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/server/auth/session'
import { consumeRateLimit } from '@/server/rate-limit'
import { reviewSchema, submitReview } from '@/server/reviews'
import { setWishlisted } from '@/server/wishlist'

export type ReviewFormState = { error?: string; message?: string; fieldErrors?: Record<string, string> }

const productId = z.string().min(1).max(40)

export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Please sign in to write a review.' }
  const id = productId.safeParse(formData.get('productId'))
  if (!id.success) return { error: 'Invalid request.' }
  const parsed = reviewSchema.safeParse({
    rating: formData.get('rating') ?? '',
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { fieldErrors }
  }
  const limit = await consumeRateLimit(`review:user:${user.id}`, 10, 60 * 60)
  if (!limit.allowed) return { error: 'Too many attempts. Please try again later.' }
  const r = await submitReview(user.id, id.data, parsed.data)
  if (!r.ok) return { error: r.error }
  updateTag('reviews')
  refresh()
  return { message: 'Thank you. Your review will appear once it has been checked.' }
}

export async function setWishlistAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  const id = productId.safeParse(formData.get('productId'))
  if (!user || !id.success) return
  await setWishlisted(user.id, id.data, formData.get('save') === '1')
  refresh()
}
