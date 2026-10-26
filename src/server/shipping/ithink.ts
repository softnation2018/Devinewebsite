// iThink Logistics, API v3, as documented at docs.ithinklogistics.com:
//   order/add.json, order/track.json, order/cancel.json, shipping/label.json
// Order, cancel and label calls go to ITHINK_BASE_URL; tracking is served
// from a different host in the docs, so it has ITHINK_TRACK_BASE_URL.

import { callJson, messageOf, rupees } from './http'
import { type CreatedShipment, type Parcel, ProviderRejected, ProviderUnknown, type ShippingProvider, type TrackingResult, type TrackingScan } from './types'

export type IThinkConfig = {
  baseUrl: string
  trackBaseUrl: string
  accessToken: string
  secretKey: string
  pickupAddressId: string
  returnAddressId: string
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

/** dd-mm-yyyy in India time, the format in the docs' sample. */
export function ithinkDate(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000)
  return `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`
}

/** "2026-11-02 14:05:00" (India time) → Date; anything else → null. */
export function parseIthinkTime(v: unknown): Date | null {
  const s = str(v)
  const m = s && /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function buildAddOrderBody(cfg: IThinkConfig, p: Parcel) {
  const c = p.customer
  const address = {
    name: c.name,
    add: c.line1,
    add2: c.line2 ?? '',
    pin: c.pincode,
    city: c.city,
    state: c.state,
    country: 'India',
    phone: c.phone,
    email: c.email ?? '',
  }
  return {
    data: {
      shipments: [
        {
          waybill: '',
          order: p.orderNumber,
          order_date: ithinkDate(p.orderDate),
          total_amount: rupees(p.totalPaise),
          return_address_id: cfg.returnAddressId,
          payment_mode: p.paymentMode === 'COD' ? 'COD' : 'Prepaid',
          cod_amount: p.paymentMode === 'COD' ? rupees(p.codAmountPaise) : 0,
          shipping_charges: rupees(p.shippingPaise),
          total_discount: rupees(p.discountPaise),
          shipment_length: p.lengthCm,
          shipment_width: p.breadthCm,
          shipment_height: p.heightCm,
          // The docs give weight in kilograms.
          weight: Math.round(p.weightGrams) / 1000,
          ...address,
          is_billing_same_as_shipping: 'yes',
          billing_name: c.name,
          billing_add: c.line1,
          billing_add2: c.line2 ?? '',
          billing_pin: c.pincode,
          billing_city: c.city,
          billing_state: c.state,
          billing_country: 'India',
          billing_phone: c.phone,
          billing_email: c.email ?? '',
          products: p.items.map((i) => ({
            product_name: i.name.slice(0, 200),
            product_sku: i.sku,
            product_quantity: i.quantity,
            product_price: rupees(i.unitPricePaise),
            product_tax_rate: i.gstRateBp / 100,
          })),
        },
      ],
      pickup_address_id: cfg.pickupAddressId,
      access_token: cfg.accessToken,
      secret_key: cfg.secretKey,
      logistics: '',
      s_type: '',
      order_type: '',
    },
  }
}

export function readAddOrderResponse(json: unknown): CreatedShipment {
  const first = obj(obj(obj(json).data)['1'])
  const status = str(first.status)
  if (!status) throw new ProviderUnknown(`iThink did not confirm the shipment${messageOf(json) ? `: ${messageOf(json)}` : '.'}`)
  if (status.toLowerCase() !== 'success') throw new ProviderRejected(`iThink refused the shipment: ${str(first.remark) ?? messageOf(json) ?? status}`)
  const awb = str(first.waybill)
  if (!awb) throw new ProviderUnknown('iThink reported success but gave no AWB number. Check the iThink panel before trying again.')
  return { awbNumber: awb, providerShipmentId: str(first.refnum), courierName: str(first.logistic_name), trackingUrl: str(first.tracking_url) }
}

export function readTrackResponse(json: unknown): TrackingResult[] {
  const data = obj(obj(json).data)
  return Object.values(data).flatMap((raw) => {
    const t = obj(raw)
    const awb = str(t.awb_no)
    const current = str(t.current_status)
    if (!awb || !current) return []
    const scans: TrackingScan[] = (Array.isArray(t.scan_details) ? t.scan_details : []).flatMap((s) => {
      const scan = obj(s)
      const at = parseIthinkTime(scan.scan_date_time)
      const status = str(scan.status)
      return at && status ? [{ status, code: str(scan.status_code), location: str(scan.scan_location), remark: str(scan.remark) ?? str(scan.status_reason), occurredAt: at }] : []
    })
    const last = obj(t.last_scan_details)
    const lastAt = parseIthinkTime(last.status_date_time)
    if (lastAt && str(last.status) && !scans.some((s) => s.occurredAt.getTime() === lastAt.getTime() && s.status === str(last.status))) {
      scans.push({ status: str(last.status)!, code: str(last.status_code), location: str(last.scan_location), remark: str(last.remark) ?? str(last.reason), occurredAt: lastAt })
    }
    const edd = str(t.expected_delivery_date)
    const eddDate = edd && /^\d{4}-\d{2}-\d{2}/.test(edd) ? new Date(`${edd.slice(0, 10)}T00:00:00+05:30`) : null
    return [{ awbNumber: awb, currentStatus: current, currentCode: str(t.current_status_code), expectedDelivery: eddDate, scans }]
  })
}

export function ithink(cfg: IThinkConfig): ShippingProvider {
  const auth = { access_token: cfg.accessToken, secret_key: cfg.secretKey }
  return {
    name: 'ITHINK',
    label: 'iThink Logistics',
    async createShipment(parcel) {
      return readAddOrderResponse(await callJson(`${cfg.baseUrl}/order/add.json`, { method: 'POST', body: buildAddOrderBody(cfg, parcel), timeoutMs: 30_000 }))
    },
    async track(awbNumbers) {
      const out: TrackingResult[] = []
      // The docs allow at most 10 AWB numbers per request.
      for (let i = 0; i < awbNumbers.length; i += 10) {
        const json = await callJson(`${cfg.trackBaseUrl}/order/track.json`, { method: 'POST', body: { data: { ...auth, awb_number_list: awbNumbers.slice(i, i + 10).join(',') } } })
        out.push(...readTrackResponse(json))
      }
      return out
    },
    async cancel({ awbNumber }) {
      if (!awbNumber) throw new ProviderRejected('This shipment has no AWB number to cancel.')
      const json = await callJson(`${cfg.baseUrl}/order/cancel.json`, { method: 'POST', body: { data: { ...auth, awb_numbers: awbNumber } } })
      const first = obj(obj(obj(json).data)['1'])
      if (str(first.status)?.toLowerCase() !== 'success') throw new ProviderRejected(`iThink did not cancel it: ${str(first.remark) ?? messageOf(json) ?? 'no reason given'}`)
    },
    async labelPdf(awbNumber) {
      const json = await callJson(`${cfg.baseUrl}/shipping/label.json`, {
        method: 'POST',
        body: { data: { ...auth, awb_numbers: awbNumber, page_size: 'A4', display_cod_prepaid: '', display_shipper_mobile: '', display_shipper_address: '' } },
      })
      const url = str(obj(json).file_name)
      return url && /^https?:\/\//.test(url) ? url : null
    },
  }
}
