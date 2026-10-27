import type { UserRole } from '@/generated/prisma/client'
import { formatPaise, paiseToRupeeInput } from '@/lib/money'
import { can } from '@/server/admin/access'
import { getRefundPanel } from '@/server/payments/refunds'
import { dateTime } from '../../ui'
import { RefundForm, ResolveRefundForm } from './RefundForms'

const STATUS: Record<string, string> = { REQUESTED: 'Requested', PROCESSING: 'In progress', COMPLETED: 'Done', FAILED: 'Not made' }
const METHOD: Record<string, string> = { razorpay: 'Razorpay', upi: 'UPI', bank_transfer: 'Bank transfer' }

export async function RefundPanel({ role, order }: { role: UserRole; order: { id: string; paymentMethod: string; paymentStatus: string } }) {
  const panel = await getRefundPanel(order.id)
  if (panel.paidPaise === 0 && panel.refunds.length === 0) return null
  const canRefund = can(role, 'refunds.issue')
  return (
    <section className="rounded-sm border border-gold-500/30 bg-white p-4">
      <h2 className="font-serif text-xl text-maroon-900">Refunds</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <dt className="text-xs text-stone">Paid</dt>
          <dd>{formatPaise(panel.paidPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone">Refunded</dt>
          <dd>{formatPaise(panel.completedPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone">Can refund</dt>
          <dd>{formatPaise(panel.availablePaise)}</dd>
        </div>
      </dl>
      {panel.refunds.length > 0 && (
        <ul className="mt-4 divide-y divide-gold-500/20 text-sm">
          {panel.refunds.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex justify-between gap-2">
                <span>
                  {formatPaise(r.amountPaise)} · {METHOD[r.method ?? ''] ?? r.method}
                </span>
                <span className={r.status === 'COMPLETED' ? '' : 'text-maroon-700'}>{STATUS[r.status]}</span>
              </div>
              <p className="text-xs text-stone">
                {dateTime.format(r.createdAt)} · {r.reason}
                {r.providerRefundId && <> · {r.providerRefundId.replace(/^(upi|bank_transfer):/, 'Ref ')}</>}
              </p>
              {canRefund && r.status === 'PROCESSING' && r.method === 'razorpay' && <ResolveRefundForm refundId={r.id} />}
            </li>
          ))}
        </ul>
      )}
      {canRefund && panel.availablePaise > 0 && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-maroon-800">Issue a refund</summary>
          <div className="mt-3">
            <RefundForm orderId={order.id} online={order.paymentMethod === 'RAZORPAY'} maxRupees={paiseToRupeeInput(panel.availablePaise)} />
          </div>
        </details>
      )}
    </section>
  )
}
