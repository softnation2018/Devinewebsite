import { afterEach, describe, expect, it, vi } from 'vitest'
import { callJson } from './http'
import { buildAddOrderBody, ithinkDate, parseIthinkTime, readAddOrderResponse, readTrackResponse } from './ithink'
import { mapCourierStatus } from './shipments'
import { type Parcel, ProviderRejected, ProviderUnknown } from './types'

const cfg = { baseUrl: 'https://x/api_v3', trackBaseUrl: 'https://y/api_v3', accessToken: 'tok', secretKey: 'sec', pickupAddressId: '24', returnAddressId: '25' }
const parcel: Parcel = {
  orderNumber: 'DM-261102-ABC123',
  orderDate: new Date('2026-11-01T20:00:00Z'), // 2 Nov in India
  paymentMode: 'COD',
  totalPaise: 153_400,
  codAmountPaise: 153_400,
  shippingPaise: 7_900,
  discountPaise: 0,
  weightGrams: 350,
  lengthCm: 15,
  breadthCm: 12,
  heightCm: 8,
  customer: { name: 'Asha Verma', phone: '9876543210', email: null, line1: '12 MG Road', line2: null, city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  items: [{ name: 'Rudraksha', sku: 'RUD-5M', quantity: 1, unitPricePaise: 145_500, gstRateBp: 0 }],
}

describe('iThink request', () => {
  it('sends the documented fields, in rupees and kilograms, with the India date', () => {
    const body = buildAddOrderBody(cfg, parcel)
    const s = body.data.shipments[0]
    expect(body.data).toMatchObject({ pickup_address_id: '24', access_token: 'tok', secret_key: 'sec' })
    expect(s).toMatchObject({ order: 'DM-261102-ABC123', order_date: '02-11-2026', payment_mode: 'COD', cod_amount: 1534, total_amount: 1534, weight: 0.35, pin: '411001', return_address_id: '25' })
    expect(s.products[0]).toMatchObject({ product_name: 'Rudraksha', product_quantity: 1, product_price: 1455 })
    expect(buildAddOrderBody(cfg, { ...parcel, paymentMode: 'PREPAID' }).data.shipments[0]).toMatchObject({ payment_mode: 'Prepaid', cod_amount: 0 })
    expect(ithinkDate(new Date('2026-01-05T00:00:00Z'))).toBe('05-01-2026')
  })
})

describe('iThink responses', () => {
  it('reads the AWB from the documented success reply', () => {
    const reply = { status: 'success', status_code: 200, html_message: ' ', data: { '1': { status: 'Success', remark: '', waybill: '1369010531020', refnum: 'GK0034', logistic_name: 'delhivery', tracking_url: 'https://ithinklogistics.co.in/postship/tracking/1369010531020' } } }
    expect(readAddOrderResponse(reply)).toEqual({ awbNumber: '1369010531020', providerShipmentId: 'GK0034', courierName: 'delhivery', trackingUrl: 'https://ithinklogistics.co.in/postship/tracking/1369010531020' })
  })
  it('treats a refusal as safe to retry, and anything unclear as unknown', () => {
    expect(() => readAddOrderResponse({ data: { '1': { status: 'Failed', remark: 'Pincode not serviceable' } } })).toThrow(ProviderRejected)
    expect(() => readAddOrderResponse({ status: 'error', html_message: 'Server busy' })).toThrow(ProviderUnknown)
    expect(() => readAddOrderResponse({ data: { '1': { status: 'Success' } } })).toThrow(ProviderUnknown)
  })
  it('reads tracking scans and skips any with an unreadable time', () => {
    const reply = {
      status_code: 200,
      data: {
        '1369010531020': {
          awb_no: '1369010531020',
          current_status: 'In Transit',
          current_status_code: 'UD',
          expected_delivery_date: '2026-11-05',
          last_scan_details: { status: 'In Transit', status_code: 'UD', status_date_time: '2026-11-03 09:10:00', scan_location: 'Mumbai Hub' },
          scan_details: [
            { status: 'Manifested', status_code: 'UD', scan_location: 'Pune', scan_date_time: '2026-11-02 18:00:00' },
            { status: 'Picked Up', status_code: 'UD', scan_location: 'Pune', scan_date_time: 'yesterday' },
          ],
        },
      },
    }
    const [t] = readTrackResponse(reply)
    expect(t).toMatchObject({ awbNumber: '1369010531020', currentStatus: 'In Transit', currentCode: 'UD' })
    expect(t.scans.map((s) => s.status)).toEqual(['Manifested', 'In Transit'])
    expect(t.scans[0].occurredAt.toISOString()).toBe('2026-11-02T12:30:00.000Z')
    expect(parseIthinkTime('2026-11-02 18:00')).toEqual(new Date('2026-11-02T12:30:00Z'))
  })
  it('maps every documented forward status, and leaves unknown ones alone', () => {
    expect(mapCourierStatus('Out For Delivery')).toBe('OUT_FOR_DELIVERY')
    expect(mapCourierStatus('RTO Delivered')).toBe('RTO_DELIVERED')
    expect(mapCourierStatus('delivered')).toBe('DELIVERED')
    expect(mapCourierStatus('Lost')).toBeNull()
    expect(mapCourierStatus('Something new')).toBeNull()
  })
})

describe('callJson', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reports a 4xx as a refusal and a network failure as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Invalid pincode"}', { status: 422 })))
    await expect(callJson('https://x', { method: 'POST', body: {} })).rejects.toThrow(/refused.*Invalid pincode/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 502 })))
    await expect(callJson('https://x', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ProviderUnknown)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }))
    await expect(callJson('https://x', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ProviderUnknown)
  })
})
