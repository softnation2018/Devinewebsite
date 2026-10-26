import { isAuthorisedCron } from '@/server/cron-auth'
import { refreshTracking } from '@/server/shipping/shipments'

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) return new Response('Unauthorized', { status: 401 })
  return Response.json(await refreshTracking())
}
