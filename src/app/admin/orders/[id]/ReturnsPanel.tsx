import type { UserRole } from '@/generated/prisma/client'
import { can } from '@/server/admin/access'
import { RETURN_STATUS_LABEL, returnsForOrder } from '@/server/returns'
import { dateTime } from '../../ui'
import { ReturnActions } from './ReturnForms'

export async function ReturnsPanel({ role, orderId }: { role: UserRole; orderId: string }) {
  const returns = await returnsForOrder(orderId)
  if (returns.length === 0) return null
  return (
    <section className="rounded-sm border border-gold-500/30 bg-white p-4">
      <h2 className="font-serif text-xl text-maroon-900">Returns</h2>
      <ul className="mt-3 divide-y divide-gold-500/20 text-sm">
        {returns.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.reasonLabel}</span>
              <span>{RETURN_STATUS_LABEL[r.status]}</span>
            </div>
            <p className="text-xs text-stone">Requested {dateTime.format(r.requestedAt)}</p>
            <ul className="mt-1 list-disc pl-5">
              {r.lines.map((l) => (
                <li key={l.orderItemId}>
                  {l.name} × {l.quantity}
                </li>
              ))}
            </ul>
            {r.customerNote && <p className="mt-1 whitespace-pre-wrap">Customer: {r.customerNote}</p>}
            {r.adminNote && <p className="mt-1 text-xs whitespace-pre-wrap text-stone">Staff note: {r.adminNote}</p>}
            {r.awbNumber && <p className="mt-1 text-xs text-stone">Return AWB {r.awbNumber}</p>}
            {can(role, 'orders.update') && <ReturnActions returnId={r.id} status={r.status} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
