import { isAuthorisedCron } from '@/server/cron-auth'
import { runEmailJobs } from '@/server/notifications'
import { refreshTracking } from '@/server/shipping/shipments'

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) return new Response('Unauthorized', { status: 401 })
  const tracking = await refreshTracking()
  // Send the "shipped" and "delivered" emails this run queued.
  return Response.json({ ...tracking, emails: await runEmailJobs(50) })
}
