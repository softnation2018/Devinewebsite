import 'server-only'
import { getCurrentUser } from '@/server/auth/session'
import { orderAccessToken } from '@/server/shop/cart-session'
import { findOrderForViewer } from '@/server/shop/checkout'

/** The order if this visitor may see it: their account, the email link key, or this browser's cookie. */
export async function loadViewableOrder(orderNumber: string, key: string | null) {
  const [user, cookieToken] = await Promise.all([getCurrentUser(), orderAccessToken()])
  const order =
    (await findOrderForViewer(orderNumber, { userId: user?.id ?? null, accessToken: key })) ??
    (await findOrderForViewer(orderNumber, { userId: null, accessToken: cookieToken }))
  return order ? { order, user } : null
}
