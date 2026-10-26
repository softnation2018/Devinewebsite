'use client'

import { useActionState, useState } from 'react'
import { FormAlert } from '@/components/forms'
import { type AdminState, bookShipmentAction, codRemittanceAction, shipmentAction } from '../../actions'

const input = 'mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-sm'
const button = 'rounded-sm border border-maroon-900 px-4 py-2 text-sm text-maroon-900 hover:bg-maroon-900 hover:text-ivory disabled:opacity-50'

export function BookShipmentForm({ orderId, providers, weightGrams }: { orderId: string; providers: { name: string; label: string }[]; weightGrams: number }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(bookShipmentAction, {})
  const [provider, setProvider] = useState(providers[0]?.name ?? 'MANUAL')
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div>
        <label htmlFor="ship-provider" className="block text-sm font-medium">
          Send with
        </label>
        <select id="ship-provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={input}>
          {providers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.label}
            </option>
          ))}
          <option value="MANUAL">Another courier (enter details by hand)</option>
        </select>
        {providers.length === 0 && <p className="mt-1 text-xs text-stone">No courier account is connected yet, so parcels are recorded by hand.</p>}
      </div>
      {provider === 'MANUAL' && (
        <div className="grid gap-3">
          <div>
            <label htmlFor="ship-courier" className="block text-sm font-medium">
              Courier name
            </label>
            <input id="ship-courier" name="courierName" required maxLength={80} className={input} />
          </div>
          <div>
            <label htmlFor="ship-awb" className="block text-sm font-medium">
              Tracking (AWB) number
            </label>
            <input id="ship-awb" name="awbNumber" required maxLength={60} className={input} />
          </div>
          <div>
            <label htmlFor="ship-url" className="block text-sm font-medium">
              Tracking link (optional)
            </label>
            <input id="ship-url" name="trackingUrl" type="url" placeholder="https://" maxLength={300} className={input} />
          </div>
        </div>
      )}
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1 text-sm font-medium">Packed parcel</legend>
        <label className="text-xs">
          Weight (g)
          <input name="weightGrams" defaultValue={weightGrams} inputMode="numeric" required className={input} />
        </label>
        <label className="text-xs">
          Length (cm)
          <input name="lengthCm" defaultValue="15" inputMode="decimal" required className={input} />
        </label>
        <label className="text-xs">
          Breadth (cm)
          <input name="breadthCm" defaultValue="12" inputMode="decimal" required className={input} />
        </label>
        <label className="text-xs">
          Height (cm)
          <input name="heightCm" defaultValue="8" inputMode="decimal" required className={input} />
        </label>
      </fieldset>
      <p className="text-xs text-stone">Weigh and measure the packed box. Couriers charge on these, and a wrong value can bring an extra charge later.</p>
      <button type="submit" disabled={pending} className={button}>
        {pending ? 'Booking…' : provider === 'MANUAL' ? 'Save shipment' : 'Book courier'}
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}

export function ShipmentButton({ shipmentId, op, label, confirmText, danger }: { shipmentId: string; op: string; label: string; confirmText?: string; danger?: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(shipmentAction, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault()
      }}
      className="space-y-1"
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" disabled={pending} className={`${button} ${danger ? 'border-maroon-700 text-maroon-700' : ''}`}>
        {pending ? 'Working…' : label}
      </button>
      {state.error && <p className="text-xs text-maroon-700">{state.error}</p>}
    </form>
  )
}

export function ConfirmAwbForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(shipmentAction, {})
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="op" value="confirm" />
      <label htmlFor={`awb-${shipmentId}`} className="block text-sm font-medium">
        AWB number shown in the courier panel
      </label>
      <input id={`awb-${shipmentId}`} name="awbNumber" required maxLength={60} className={input} />
      <button type="submit" disabled={pending} className={button}>
        Save AWB
      </button>
      {state.error && <p className="text-xs text-maroon-700">{state.error}</p>}
    </form>
  )
}

export function RemittanceForm({ remittanceId, amount }: { remittanceId: string; amount: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(codRemittanceAction, {})
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="remittanceId" value={remittanceId} />
      <label className="block text-xs">
        Bank reference (UTR) of the courier’s payout
        <input name="utrNumber" required maxLength={40} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          Amount received (₹)
          <input name="amount" defaultValue={amount} inputMode="decimal" required className={input} />
        </label>
        <label className="block text-xs">
          Received on
          <input name="remittedAt" type="date" required className={input} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={button}>
        Record payout
      </button>
      <FormAlert error={state.error} message={state.message} />
    </form>
  )
}
