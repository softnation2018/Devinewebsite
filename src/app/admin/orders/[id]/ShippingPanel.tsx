import type { CodRemittanceStatus, ShipmentStatus } from '@/generated/prisma/client'
import { formatPaise, paiseToRupeeInput } from '@/lib/money'
import { can } from '@/server/admin/access'
import { configuredProviders } from '@/server/shipping/registry'
import { getShippingForOrder, LIVE, suggestedWeightGrams } from '@/server/shipping/shipments'
import type { UserRole } from '@/generated/prisma/client'
import { dateTime } from '../../ui'
import { BookShipmentForm, ConfirmAwbForm, RemittanceForm, ShipmentButton } from './ShippingForms'

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  DRAFT: 'Draft',
  REQUESTED: 'Booking not confirmed',
  CREATED: 'Booked',
  PICKUP_SCHEDULED: 'Awaiting pickup',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  NDR: 'Delivery attempt failed',
  DELIVERED: 'Delivered',
  RTO_IN_TRANSIT: 'Returning to us',
  RTO_DELIVERED: 'Returned to us',
  CANCELLED: 'Cancelled',
  FAILED: 'Not created',
}

const COD_LABEL: Record<CodRemittanceStatus, string> = {
  AWAITED: 'Awaiting delivery',
  COLLECTED: 'Collected by courier, payout pending',
  REMITTED: 'Paid out to us',
  RECONCILED: 'Reconciled',
  FAILED: 'Not collected',
}

type Props = {
  role: UserRole
  order: { id: string; status: string; paymentMethod: string; paymentStatus: string; items: { weightGrams: number; quantity: number }[] }
}

export async function ShippingPanel({ role, order }: Props) {
  const [shipments, remittances] = await getShippingForOrder(order.id)
  const providers = configuredProviders().map((p) => ({ name: p.name, label: p.label }))
  const manage = can(role, 'shipping.manage')
  const canBook =
    manage &&
    (order.status === 'CONFIRMED' || order.status === 'PROCESSING') &&
    !(order.paymentMethod === 'RAZORPAY' && order.paymentStatus !== 'PAID') &&
    !shipments.some((s) => LIVE.includes(s.status))

  return (
    <section className="space-y-4 rounded-sm border border-gold-500/30 bg-white p-5 text-sm">
      <h2 className="font-serif text-xl text-maroon-900">Shipping</h2>
      {shipments.length === 0 && <p className="text-stone">Not shipped yet.</p>}
      {shipments.map((s) => (
        <div key={s.id} className="space-y-2 border-b border-gold-500/20 pb-4 last:border-0">
          <p>
            <span className="font-medium">{SHIPMENT_STATUS_LABEL[s.status]}</span>
            {' · '}
            {s.provider === 'MANUAL' ? s.courierName : `${s.provider === 'ITHINK' ? 'iThink Logistics' : 'Shiprocket'}${s.courierName ? ` (${s.courierName})` : ''}`}
          </p>
          {s.awbNumber && (
            <p>
              AWB {s.awbNumber}
              {s.trackingUrl && (
                <>
                  {' · '}
                  <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Track
                  </a>
                </>
              )}
              {s.provider === 'ITHINK' && s.status !== 'CANCELLED' && (
                <>
                  {' · '}
                  <a href={`/admin/shipments/${s.id}/label`} target="_blank" className="underline">
                    Shipping label
                  </a>
                </>
              )}
            </p>
          )}
          {s.weightGrams && <p className="text-xs text-stone">Declared {s.weightGrams} g · booked {dateTime.format(s.createdAt)}</p>}
          {s.lastError && <p className="rounded-sm bg-gold-100 px-2 py-1 text-xs">{s.lastError}</p>}
          {manage && s.status === 'REQUESTED' && (
            <div className="space-y-2">
              <ConfirmAwbForm shipmentId={s.id} />
              <ShipmentButton shipmentId={s.id} op="not_created" label="Courier has no such parcel" confirmText="Only do this after checking the courier panel. Continue?" />
            </div>
          )}
          {manage && s.provider === 'MANUAL' && (s.status === 'CREATED' || s.status === 'PICKUP_SCHEDULED') && <ShipmentButton shipmentId={s.id} op="in_transit" label="Mark handed to courier" />}
          {manage && s.provider === 'MANUAL' && ['CREATED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'NDR'].includes(s.status) && (
            <ShipmentButton shipmentId={s.id} op="delivered" label="Mark delivered" confirmText="Only mark delivered when the courier confirms it. Continue?" />
          )}
          {manage && (s.status === 'CREATED' || s.status === 'PICKUP_SCHEDULED') && (
            <ShipmentButton shipmentId={s.id} op="cancel" label="Cancel shipment" confirmText="Cancel this courier booking?" danger />
          )}
          {s.events.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-stone">Courier updates ({s.events.length})</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {s.events.map((e) => (
                  <li key={e.id}>
                    {dateTime.format(e.occurredAt)} · {e.status}
                    {e.location && ` · ${e.location}`}
                    {e.description && <span className="text-stone"> · {e.description}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
      {canBook && <BookShipmentForm orderId={order.id} providers={providers} weightGrams={suggestedWeightGrams(order.items)} />}

      {remittances.length > 0 && (
        <div className="space-y-2 border-t border-gold-500/20 pt-4">
          <h3 className="text-xs tracking-wider text-stone uppercase">Cash on delivery</h3>
          {remittances.map((r) => (
            <div key={r.id} className="space-y-2">
              <p>
                {formatPaise(r.amountPaise)} · {COD_LABEL[r.status]}
                {r.utrNumber && <span className="text-stone"> · UTR {r.utrNumber}</span>}
              </p>
              {r.note && <p className="text-xs text-stone">{r.note}</p>}
              {r.status === 'COLLECTED' && can(role, 'cod.record') && <RemittanceForm remittanceId={r.id} amount={paiseToRupeeInput(r.amountPaise)} />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
