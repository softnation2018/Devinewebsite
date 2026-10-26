'use client'

import { useActionState } from 'react'
import { Field, FormAlert, SubmitButton } from '@/components/forms'
import { formatPaise } from '@/lib/money'
import { INDIAN_STATES } from '@/server/shop/address'
import { type CheckoutState, placeOrderAction } from './actions'

type Defaults = Partial<Record<'fullName' | 'phone' | 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'pincode', string>>

export function CheckoutForm({
  signedInEmail,
  defaults,
  online,
  cod,
  codReason,
  codFeePaise,
}: {
  signedInEmail: string | null
  defaults: Defaults
  online: boolean
  cod: boolean
  codReason: string | null
  codFeePaise: number
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(placeOrderAction, {})
  const v: Record<string, string | undefined> = { ...defaults, ...state.values }
  const e = state.fieldErrors ?? {}
  const defaultMethod = v.paymentMethod ?? (online ? 'RAZORPAY' : cod ? 'COD' : '')

  return (
    <form action={action} className="space-y-8" noValidate>
      <FormAlert error={state.error} />

      <fieldset className="space-y-4">
        <legend className="font-serif text-xl text-maroon-900">Contact</legend>
        {signedInEmail ? (
          <p className="text-sm">
            Signed in as <strong>{signedInEmail}</strong>
          </p>
        ) : (
          <Field name="email" label="Email" type="email" autoComplete="email" defaultValue={v.email} error={e.email} hint="We send your order confirmation here." />
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-serif text-xl text-maroon-900">Delivery address</legend>
        <Field name="fullName" label="Full name" autoComplete="shipping name" defaultValue={v.fullName} error={e.fullName} />
        <Field name="phone" label="Mobile number" type="tel" autoComplete="shipping tel" defaultValue={v.phone} error={e.phone} hint="The courier may call this number." />
        <Field name="line1" label="House / flat number and street" autoComplete="shipping address-line1" defaultValue={v.line1} error={e.line1} />
        <Field name="line2" label="Area / locality (optional)" autoComplete="shipping address-line2" defaultValue={v.line2} error={e.line2} required={false} />
        <Field name="landmark" label="Landmark (optional)" defaultValue={v.landmark} error={e.landmark} required={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="city" label="City" autoComplete="shipping address-level2" defaultValue={v.city} error={e.city} />
          <Field name="pincode" label="PIN code" autoComplete="shipping postal-code" defaultValue={v.pincode} error={e.pincode} />
        </div>
        <div>
          <label htmlFor="field-state" className="block text-sm font-medium">
            State
          </label>
          <select
            id="field-state"
            name="state"
            autoComplete="shipping address-level1"
            defaultValue={v.state ?? ''}
            aria-invalid={e.state ? true : undefined}
            aria-describedby={e.state ? 'field-state-error' : undefined}
            className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2.5 text-base"
          >
            <option value="" disabled>
              Choose a state
            </option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {e.state && (
            <p id="field-state-error" className="mt-1 text-sm text-maroon-700">
              {e.state}
            </p>
          )}
        </div>
        {signedInEmail && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="saveAddress" defaultChecked className="h-4 w-4 accent-maroon-900" />
            Save this address to my account
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-xl text-maroon-900">Payment</legend>
        <PaymentOption value="RAZORPAY" enabled={online} defaultMethod={defaultMethod} title="Pay online" note={online ? 'UPI, cards, net banking and wallets through Razorpay.' : 'Online payment is being set up and is not available yet.'} />
        <PaymentOption
          value="COD"
          enabled={cod}
          defaultMethod={defaultMethod}
          title="Cash on Delivery"
          note={cod ? (codFeePaise > 0 ? `A ${formatPaise(codFeePaise)} fee is added for Cash on Delivery.` : 'Pay in cash when your order arrives.') : (codReason ?? 'Not available.')}
        />
        {e.paymentMethod && <p className="text-sm text-maroon-700">{e.paymentMethod}</p>}
      </fieldset>

      <div>
        <label htmlFor="field-note" className="block text-sm font-medium">
          Note for us (optional)
        </label>
        <textarea id="field-note" name="customerNote" maxLength={500} rows={3} defaultValue={v.customerNote} className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-base" />
      </div>

      <SubmitButton pendingText="Placing order…">Place order</SubmitButton>
      <p className="text-xs text-stone">The final amount is worked out on our server from current prices and stock when you place the order.</p>
    </form>
  )
}

function PaymentOption({ value, enabled, defaultMethod, title, note }: { value: string; enabled: boolean; defaultMethod: string; title: string; note: string }) {
  return (
    <label className={`flex gap-3 rounded-sm border p-4 ${enabled ? 'cursor-pointer border-stone/40 bg-white has-checked:border-maroon-800' : 'border-stone/20 bg-ivory text-stone'}`}>
      <input type="radio" name="paymentMethod" value={value} disabled={!enabled} defaultChecked={enabled && defaultMethod === value} className="mt-1 h-4 w-4 accent-maroon-900" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-stone">{note}</span>
      </span>
    </label>
  )
}
