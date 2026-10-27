import { isAuthorisedCron } from '@/server/cron-auth'
import { runEmailJobs } from '@/server/notifications'

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) return new Response('Unauthorized', { status: 401 })
  return Response.json(await runEmailJobs(50))
}
