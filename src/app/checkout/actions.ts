'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatPaise } from '@/lib/money'
import { clientIp, getCurrentUser } from '@/server/auth/session'
import { sendEmail } from '@/server/email'
import { consumeRateLimit } from '@/server/rate-limit'
import { getCommerceSettings, onlinePaymentAvailable } from '@/server/settings'
import { addressSchema } from '@/server/shop/address'
import { getCartCouponCode } from '@/server/shop/cart'
import { currentCartId, rememberOrderAccess } from '@/server/shop/cart-session'
import { placeOrder } from '@/server/shop/checkout'

export type CheckoutState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const checkoutSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address.').optional(),
  address: addressSchema,
  paymentMethod: z.enum(['RAZORPAY', 'COD'], { message: 'Please choose how you would like to pay.' }),
  customerNote: z.string().trim().max(500).optional().transform((v) => v || null),
  saveAddress: z.boolean(),
})

const ADDRESS_FIELDS = ['fullName', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode'] as const

export async function placeOrderAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v

  const user = await getCurrentUser()
  const parsed = checkoutSchema.safeParse({
    email: user ? undefined : values.email ?? '',
    address: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, values[f] ?? ''])),
    paymentMethod: values.paymentMethod,
    customerNote: values.customerNote,
    saveAddress: values.saveAddress === 'on',
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] === 'address' ? issue.path[1] : issue.path[0])
      fieldErrors[key] ??= issue.message
    }
    return { values, fieldErrors, error: 'Please check the highlighted fields.' }
  }
  if (!user && !parsed.data.email) return { values, fieldErrors: { email: 'Enter your email address.' } }

  const limit = await consumeRateLimit(`checkout:ip:${await clientIp()}`, 10, 10 * 60)
  if (!limit.allowed) return { values, error: 'Too many attempts. Please wait a few minutes and try again.' }

  const cartId = await currentCartId()
  if (!cartId) redirect('/cart')

  const email = user?.email ?? parsed.data.email!
  const result = await placeOrder(
    {
      cartId,
      userId: user?.id ?? null,
      email,
      address: parsed.data.address,
      paymentMethod: parsed.data.paymentMethod,
      couponCode: await getCartCouponCode(cartId),
      customerNote: parsed.data.customerNote,
      saveAddress: parsed.data.saveAddress,
    },
    await getCommerceSettings(),
    onlinePaymentAvailable(),
  )

  if (!result.ok) {
    if (result.reason === 'EMPTY_CART' || result.reason === 'CART_CHANGED') redirect('/cart')
    return { values, error: result.message }
  }

  await rememberOrderAccess(result.accessToken)
  const link = `${siteUrl}/order/${result.orderNumber}?key=${result.accessToken}`
  await sendEmail({
    to: email,
    subject: `Order ${result.orderNumber} received`,
    text:
      parsed.data.paymentMethod === 'COD'
        ? `Namaste,\n\nThank you for your order ${result.orderNumber}. Please keep ${formatPaise(result.totalPaise)} ready to pay on delivery.\n\nView your order:\n${link}\n\nDivine Mantra`
        : `Namaste,\n\nWe have received order ${result.orderNumber} for ${formatPaise(result.totalPaise)}. It will be confirmed once your payment is verified.\n\nView your order:\n${link}\n\nDivine Mantra`,
  })
  redirect(`/order/${result.orderNumber}`)
}
