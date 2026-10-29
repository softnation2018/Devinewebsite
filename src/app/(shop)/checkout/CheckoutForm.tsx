'use client'

import { type ReactNode, useActionState, useState } from 'react'
import { Field, FormAlert, SubmitButton } from '@/components/forms'
import { OrderSummary } from '@/components/OrderSummary'
import { formatPaise } from '@/lib/money'
import type { PricingResult } from '@/server/pricing'
import { INDIAN_STATES } from '@/server/shop/address'
import type { DeliveryChoice, PaymentChoice, PaymentOptions } from '@/server/shop/checkout'
import { type CheckoutState, placeOrderAction } from './actions'

export type CheckoutChoices = { standardOnline: PricingResult; standardCod: PricingResult; expressOnline: PricingResult }

type Defaults = Partial<Record<'fullName' | 'phone' | 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'pincode', string>>

// The whole checkout lives in one client component so the order summary
// follows the delivery and payment choice as the customer changes it. The
// server works the amount out again when the order is placed.
export function CheckoutForm({
  signedInEmail,
  defaults,
  options,
  choices,
  codFeePaise,
  expressPercent,
  standardPercent,
  items,
  couponCode,
}: {
  signedInEmail: string | null
  defaults: Defaults
  options: PaymentOptions
  choices: CheckoutChoices
  codFeePaise: number
  expressPercent: number
  standardPercent: number
  items: ReactNode
  couponCode: string | null
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(placeOrderAction, {})
  const v: Record<string, string | undefined> = { ...defaults, ...state.values }
  const e = state.fieldErrors ?? {}
  const [delivery, setDelivery] = useState<DeliveryChoice>(v.delivery === 'EXPRESS' && options.express ? 'EXPRESS' : 'STANDARD')
  const [method, setMethod] = useState<PaymentChoice | ''>(
    v.paymentMethod === 'COD' || v.paymentMethod === 'RAZORPAY' ? v.paymentMethod : options.online ? 'RAZORPAY' : options.cod ? 'COD' : '',
  )
  const express = delivery === 'EXPRESS'
  const totals = express ? choices.expressOnline : method === 'COD' ? choices.standardCod : method === 'RAZORPAY' ? choices.standardOnline : choices.standardCod
  const chooseDelivery = (d: DeliveryChoice) => {
    setDelivery(d)
    if (d === 'EXPRESS') setMethod('RAZORPAY')
  }
  const summary = (
    <>
      {items}
      <OrderSummary totals={totals} couponCode={couponCode} />
    </>
  )

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div>
        {/* On phones the order sits at the top, folded, so the total is seen before the form. */}
        <details className="mb-6 rounded-sm border border-gold-500/30 bg-white lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
            <span className="text-maroon-800 underline underline-offset-2">Show order summary</span>
            <span className="font-semibold text-maroon-900">{formatPaise(totals.totalPaise)}</span>
          </summary>
          <div className="space-y-5 border-t border-gold-500/20 px-4 py-4">{summary}</div>
        </details>
        <form action={action} className="space-y-8" noValidate>
          <FormAlert error={state.error} />

          <fieldset className="space-y-4">
            <legend className="font-serif text-xl text-maroon-900">Contact</legend>
            {signedInEmail ? (
              <p className="text-sm">
                Signed in as <strong>{signedInEmail}</strong>
              </p>
            ) : (
              <Field
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                defaultValue={v.email}
                error={e.email}
                hint="We send your order confirmation here."
              />
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-serif text-xl text-maroon-900">Delivery address</legend>
            <Field name="fullName" label="Full name" autoComplete="shipping name" defaultValue={v.fullName} error={e.fullName} />
            <Field
              name="phone"
              label="Mobile number"
              type="tel"
              autoComplete="shipping tel"
              defaultValue={v.phone}
              error={e.phone}
              hint="The courier may call this number."
            />
            <Field name="line1" label="House / flat number and street" autoComplete="shipping address-line1" defaultValue={v.line1} error={e.line1} />
            <Field
              name="line2"
              label="Area / locality (optional)"
              autoComplete="shipping address-line2"
              defaultValue={v.line2}
              error={e.line2}
              required={false}
            />
            <Field name="landmark" label="Landmark (optional)" defaultValue={v.landmark} error={e.landmark} required={false} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="city" label="City" autoComplete="shipping address-level2" defaultValue={v.city} error={e.city} />
              <Field
                name="pincode"
                label="PIN code"
                autoComplete="shipping postal-code"
                inputMode="numeric"
                maxLength={6}
                defaultValue={v.pincode}
                error={e.pincode}
              />
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
            <legend className="font-serif text-xl text-maroon-900">Delivery</legend>
            <Choice
              name="delivery"
              value="STANDARD"
              enabled
              checked={delivery === 'STANDARD'}
              onChange={() => chooseDelivery('STANDARD')}
              title="Standard delivery"
              note={standardNote(options, standardPercent)}
            />
            <Choice
              name="delivery"
              value="EXPRESS"
              enabled={options.express}
              checked={express}
              onChange={() => chooseDelivery('EXPRESS')}
              title="Express delivery (2-3 days)"
              badge={options.express && expressPercent > 0 ? `${expressPercent}% off` : undefined}
              note={options.express ? `Online payment only. You save ${expressPercent}%.` : (options.expressReason ?? 'Not available.')}
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-serif text-xl text-maroon-900">Payment</legend>
            <Choice
              name="paymentMethod"
              value="RAZORPAY"
              enabled={options.online}
              checked={method === 'RAZORPAY'}
              onChange={() => setMethod('RAZORPAY')}
              title="Pay online"
              badge={options.online && (express ? expressPercent : standardPercent) > 0 ? `${express ? expressPercent : standardPercent}% off` : undefined}
              note={options.online ? 'UPI, cards, net banking and wallets.' : 'Online payment is being set up and is not available yet.'}
            />
            <Choice
              name="paymentMethod"
              value="COD"
              enabled={options.cod && !express}
              checked={method === 'COD' && !express}
              onChange={() => setMethod('COD')}
              title="Cash on Delivery"
              note={
                express
                  ? 'Not available with Express delivery. Choose Standard delivery to pay cash.'
                  : options.cod
                    ? codFeePaise > 0
                      ? `${formatPaise(codFeePaise)} extra for Cash on Delivery.`
                      : 'Pay in cash when your order arrives.'
                    : (options.codReason ?? 'Not available.')
              }
            />
            {e.paymentMethod && <p className="text-sm text-maroon-700">{e.paymentMethod}</p>}
          </fieldset>

          <div>
            <label htmlFor="field-note" className="block text-sm font-medium">
              Note for us (optional)
            </label>
            <textarea
              id="field-note"
              name="customerNote"
              maxLength={500}
              rows={3}
              defaultValue={v.customerNote}
              className="mt-1 w-full rounded-sm border border-stone/40 bg-white px-3 py-2 text-base"
            />
          </div>

          <div className="space-y-2 rounded-sm border border-gold-500/30 bg-white p-4">
            <p className="flex items-baseline justify-between text-base font-semibold text-maroon-900">
              <span>You pay</span>
              <span>{formatPaise(totals.totalPaise)}</span>
            </p>
            {totals.prepaidDiscountPaise > 0 && (
              <p className="text-sm text-emerald-800">You save {formatPaise(totals.prepaidDiscountPaise)} by paying online.</p>
            )}
            {totals.codFeePaise > 0 && <p className="text-sm text-stone">Includes {formatPaise(totals.codFeePaise)} Cash on Delivery fee.</p>}
          </div>
          <SubmitButton pendingText="Placing order…">Place order</SubmitButton>
          <p className="text-xs text-stone">The final amount is worked out on our server from current prices and stock when you place the order.</p>
        </form>
      </div>

      <aside aria-labelledby="summary-heading" className="hidden h-fit space-y-5 rounded-sm border border-gold-500/30 bg-white p-6 lg:block">
        <h2 id="summary-heading" className="font-serif text-xl text-maroon-900">
          Your order
        </h2>
        {summary}
      </aside>
    </div>
  )
}

function standardNote(options: PaymentOptions, percent: number): string {
  const online = options.online && percent > 0
  if (online && options.cod) return `Pay online and save ${percent}%, or pay cash on delivery.`
  if (online) return `Pay online and save ${percent}%.`
  if (options.cod) return options.online ? 'Pay online or cash on delivery.' : 'Pay cash on delivery.'
  return 'Delivered by our courier partner.'
}

function Choice({
  name,
  value,
  enabled,
  checked,
  onChange,
  title,
  note,
  badge,
}: {
  name: string
  value: string
  enabled: boolean
  checked: boolean
  onChange: () => void
  title: string
  note: string
  badge?: string
}) {
  return (
    <label
      className={`flex gap-3 rounded-sm border p-4 ${enabled ? 'cursor-pointer border-stone/40 bg-white has-checked:border-maroon-800' : 'border-stone/20 bg-ivory text-stone'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        disabled={!enabled}
        checked={enabled && checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-maroon-900"
      />
      <span className="flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-medium">
          {title}
          {badge && <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">{badge}</span>}
        </span>
        <span className="block text-xs text-stone">{note}</span>
      </span>
    </label>
  )
}
