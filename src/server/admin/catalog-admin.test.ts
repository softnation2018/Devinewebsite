import { describe, expect, it } from 'vitest'
import { can } from './access'
import { parseCouponForm, parseIstLocal, toIstLocal } from './coupons'
import { findClaims, parseProductForm, slugify } from './products'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const product = {
  name: 'Panchmukhi Rudraksha',
  sku: 'rud-5m',
  price: '1,499',
  gstRateBp: '0',
  weightGrams: '50',
  lowStockThreshold: '3',
  status: 'DRAFT',
}

describe('product and coupon capabilities', () => {
  it('lets staff see products and count stock, but only admins edit', () => {
    expect(can('STAFF', 'products.view')).toBe(true)
    expect(can('STAFF', 'stock.adjust')).toBe(true)
    expect(can('STAFF', 'products.edit')).toBe(false)
    expect(can('STAFF', 'products.cost')).toBe(false)
    expect(can('STAFF', 'coupons.manage')).toBe(false)
    expect(can('ADMIN', 'products.edit')).toBe(true)
    expect(can('CUSTOMER', 'products.view')).toBe(false)
  })
})

describe('findClaims', () => {
  it('separates promised outcomes from claims that need evidence', () => {
    expect(findClaims('Guaranteed to bring wealth').forbidden).toEqual(['guaranteed'])
    expect(findClaims('It cures illness').forbidden).toEqual(['cures'])
    expect(findClaims('Lab certified, from Nepal').verifiable).toEqual(['certified', 'from nepal'])
    expect(findClaims('A five-faced bead worn in prayer')).toEqual({ forbidden: [], verifiable: [] })
  })
})

describe('parseProductForm', () => {
  it('reads rupees as paise, upper-cases the SKU and makes a web address', () => {
    const r = parseProductForm(form(product))
    expect(r).toMatchObject({ ok: true, value: { pricePaise: 149_900, sku: 'RUD-5M', slug: 'panchmukhi-rudraksha', compareAt: null, returnEligible: false } })
  })
  it('refuses a zero price, a compare-at price that is not higher, and unknown GST rates', () => {
    expect(parseProductForm(form({ ...product, price: '0' }))).toMatchObject({ ok: false })
    expect(parseProductForm(form({ ...product, compareAt: '1499' }))).toMatchObject({ ok: false })
    expect(parseProductForm(form({ ...product, gstRateBp: '700' }))).toMatchObject({ ok: false })
    expect(parseProductForm(form({ ...product, weightGrams: '0' }))).toMatchObject({ ok: false })
  })
  it('slugify keeps only letters, numbers and dashes', () => {
    expect(slugify('  Shree Yantra (Copper) – 6"  ')).toBe('shree-yantra-copper-6')
  })
})

describe('coupon form', () => {
  const coupon = { code: ' diwali10 ', type: 'PERCENTAGE', percent: '10', usageLimitPerUser: '1' }
  it('reads a percentage as basis points', () => {
    expect(parseCouponForm(form(coupon))).toMatchObject({ ok: true, value: { code: 'DIWALI10', valueBp: 1000, valuePaise: null, minOrderPaise: 0 } })
  })
  it('refuses a percentage above 90, a fixed coupon with no amount, and an end before the start', () => {
    expect(parseCouponForm(form({ ...coupon, percent: '95' }))).toMatchObject({ ok: false })
    expect(parseCouponForm(form({ ...coupon, type: 'FIXED', amount: '' }))).toMatchObject({ ok: false })
    expect(parseCouponForm(form({ ...coupon, startsAt: '2026-11-02T00:00', endsAt: '2026-11-01T00:00' }))).toMatchObject({ ok: false })
  })
  it('reads form dates as India time and writes them back the same', () => {
    const d = parseIstLocal('2026-11-01T09:30')!
    expect(d.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(toIstLocal(d)).toBe('2026-11-01T09:30')
  })
})

describe('sniffImageType', () => {
  it('reads the type from the bytes, not the name', async () => {
    const { sniffImageType } = await import('./images')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBeNull()
  })
})
