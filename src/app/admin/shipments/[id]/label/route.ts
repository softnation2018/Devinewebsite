import { notFound, redirect } from 'next/navigation'
import { requireCapability } from '@/server/admin/guard'
import { db } from '@/server/db'
import { configuredProviders } from '@/server/shipping/registry'

// Asks the courier for the label PDF and sends staff straight to it.
export async function GET(_req: Request, ctx: RouteContext<'/admin/shipments/[id]/label'>) {
  await requireCapability('shipping.manage')
  const { id } = await ctx.params
  const s = await db.shipment.findUnique({ where: { id }, select: { provider: true, awbNumber: true } })
  const provider = s && configuredProviders().find((p) => p.name === s.provider)
  if (!s?.awbNumber || !provider?.labelPdf) notFound()
  let url: string | null = null
  try {
    url = await provider.labelPdf(s.awbNumber)
  } catch (e) {
    return new Response(`The courier did not return a label: ${e instanceof Error ? e.message : 'unknown error'}`, { status: 502 })
  }
  if (!url) return new Response('The courier did not return a label.', { status: 502 })
  redirect(url)
}
