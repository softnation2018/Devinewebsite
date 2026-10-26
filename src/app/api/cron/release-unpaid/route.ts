import { isAuthorisedCron } from '@/server/cron-auth'
import { releaseUnpaidOrders } from '@/server/payments/online'
import { razorpay } from '@/server/payments/razorpay'
import { onlinePaymentAvailable } from '@/server/settings'

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) return new Response('Unauthorized', { status: 401 })
  const result = await releaseUnpaidOrders(onlinePaymentAvailable() ? razorpay : null)
  return Response.json(result)
}
