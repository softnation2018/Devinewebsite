import 'server-only'
import { cookies } from 'next/headers'
import { getCurrentUser } from '../auth/session'
import { adoptGuestCart, createCart, findGuestCartId, findUserCartId } from './cart'

const secure = process.env.NODE_ENV === 'production'
const CART_COOKIE = secure ? '__Host-dm_cart' : 'dm_cart'
const ORDER_COOKIE = secure ? '__Host-dm_order' : 'dm_order'

/** The current visitor's cart id, without creating one. Safe during render. */
export async function currentCartId(): Promise<string | null> {
  const user = await getCurrentUser()
  if (user) return findUserCartId(user.id)
  return findGuestCartId((await cookies()).get(CART_COOKIE)?.value)
}

/** The current cart, created if needed. Only for server actions (it may set a cookie). */
export async function ensureCartId(): Promise<string> {
  const existing = await currentCartId()
  if (existing) return existing
  const user = await getCurrentUser()
  const cart = await createCart(user?.id ?? null)
  if (!user) {
    ;(await cookies()).set(CART_COOKIE, cart.token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    })
  }
  return cart.id
}

/** At sign-in: move the guest cart into the account. Server actions only. */
export async function adoptGuestCartFor(userId: string): Promise<void> {
  const jar = await cookies()
  const guestCartId = await findGuestCartId(jar.get(CART_COOKIE)?.value)
  if (guestCartId) await adoptGuestCart(guestCartId, userId)
  jar.delete(CART_COOKIE)
}

/** Lets this browser open the order page it just placed, without an account. */
export async function rememberOrderAccess(accessToken: string): Promise<void> {
  ;(await cookies()).set(ORDER_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
}

export async function orderAccessToken(): Promise<string | null> {
  return (await cookies()).get(ORDER_COOKIE)?.value ?? null
}
