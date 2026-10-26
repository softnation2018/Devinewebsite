// Shiprocket, using the endpoints in Shiprocket's API helpsheet:
//   auth/login, orders/create/adhoc, courier/assign/awb,
//   courier/generate/pickup, orders/cancel
// Shiprocket's tracking and label replies are not documented in a form we
// could check, so tracking here is the public tracking link only.

import { callJson, messageOf, rupees } from './http'
import { type CreatedShipment, type Parcel, ProviderRejected, ProviderUnknown, type ShippingProvider } from './types'

export type ShiprocketConfig = { baseUrl: string; email: string; password: string; pickupLocation: string }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

/** "2026-11-02 14:05" in India time. */
function srDate(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ')
}

export function buildAdhocBody(cfg: ShiprocketConfig, p: Parcel) {
  const c = p.customer
  const [first, ...rest] = c.name.trim().split(/\s+/)
  return {
    order_id: p.orderNumber,
    order_date: srDate(p.orderDate),
    pickup_location: cfg.pickupLocation,
    billing_customer_name: first,
    billing_last_name: rest.join(' '),
    billing_address: c.line1,
    billing_address_2: c.line2 ?? '',
    billing_city: c.city,
    billing_pincode: c.pincode,
    billing_state: c.state,
    billing_country: 'India',
    billing_email: c.email ?? '',
    billing_phone: c.phone,
    shipping_is_billing: true,
    order_items: p.items.map((i) => ({ name: i.name.slice(0, 200), sku: i.sku, units: i.quantity, selling_price: rupees(i.unitPricePaise), tax: i.gstRateBp / 100 })),
    payment_method: p.paymentMode === 'COD' ? 'COD' : 'Prepaid',
    shipping_charges: rupees(p.shippingPaise),
    total_discount: rupees(p.discountPaise),
    sub_total: rupees(p.totalPaise - p.shippingPaise + p.discountPaise),
    length: p.lengthCm,
    breadth: p.breadthCm,
    height: p.heightCm,
    weight: Math.round(p.weightGrams) / 1000,
  }
}

export function shiprocket(cfg: ShiprocketConfig): ShippingProvider {
  let token: { value: string; until: number } | null = null

  async function login(): Promise<string> {
    if (token && token.until > Date.now()) return token.value
    const json = obj(await callJson(`${cfg.baseUrl}/auth/login`, { method: 'POST', body: { email: cfg.email, password: cfg.password } }))
    const value = str(json.token)
    if (!value) throw new ProviderRejected('Shiprocket sign-in failed. Check the API user email and password.')
    // Tokens last 240 hours per the helpsheet; renew well before that.
    token = { value, until: Date.now() + 8 * 24 * 3_600_000 }
    return value
  }

  async function call(path: string, body: unknown) {
    const auth = await login()
    return obj(await callJson(`${cfg.baseUrl}${path}`, { method: 'POST', body, headers: { authorization: `Bearer ${auth}` }, timeoutMs: 30_000 }))
  }

  return {
    name: 'SHIPROCKET',
    label: 'Shiprocket',
    async createShipment(parcel): Promise<CreatedShipment> {
      const created = await call('/orders/create/adhoc', buildAdhocBody(cfg, parcel))
      const srOrderId = str(created.order_id)
      const shipmentId = str(created.shipment_id)
      if (!srOrderId || !shipmentId) throw new ProviderRejected(`Shiprocket did not create the order${messageOf(created) ? `: ${messageOf(created)}` : '.'}`)
      const ref = `${srOrderId}/${shipmentId}`

      let awb = str(created.awb_code)
      let courier = str(created.courier_name)
      if (!awb) {
        try {
          const assigned = await call('/courier/assign/awb', { shipment_id: shipmentId })
          const data = obj(obj(assigned.response).data)
          awb = str(data.awb_code) ?? str(assigned.awb_code)
          courier = str(data.courier_name) ?? courier
          if (!awb) throw new ProviderUnknown(`Shiprocket created the order but did not return an AWB${messageOf(assigned) ? `: ${messageOf(assigned)}` : '.'}`)
        } catch (e) {
          // The order exists at Shiprocket now: keep its id so it is never created twice.
          throw new ProviderUnknown(`${e instanceof Error ? e.message : 'AWB not assigned.'} Assign it in the Shiprocket panel, then enter the AWB here.`, { providerShipmentId: ref })
        }
      }
      // Asking for pickup is helpful but not essential; it can be done in the panel.
      await call('/courier/generate/pickup', { shipment_id: [shipmentId] }).catch(() => undefined)
      return { awbNumber: awb, providerShipmentId: ref, courierName: courier, trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` }
    },
    track: null,
    async cancel({ providerShipmentId }) {
      const srOrderId = providerShipmentId?.split('/')[0]
      if (!srOrderId) throw new ProviderRejected('This shipment has no Shiprocket order id to cancel.')
      await call('/orders/cancel', { ids: [Number(srOrderId)] })
    },
    labelPdf: null,
  }
}
