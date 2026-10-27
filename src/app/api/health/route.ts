import { db } from '@/server/db'

// For Docker and uptime monitors: 200 when the app can reach the database.
// It says nothing else about the shop, so it is safe to leave public.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
