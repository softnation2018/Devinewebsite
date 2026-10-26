import { describe, expect, it } from 'vitest'
import { parseCommerceSettings } from '../settings'
import { addressSchema, normaliseIndianMobile } from './address'
import { paymentOptions } from './checkout'

describe('normaliseIndianMobile', () => {
  it('accepts common ways of writing a mobile number', () => {
    for (const v of ['9876543210', '+91 98765 43210', '+919876543210', '09876543210', '98765-43210']) {
      expect(normaliseIndianMobile(v)).toBe('9876543210')
    }
  })
  it('rejects landlines, short numbers and junk', () => {
    for (const v of ['1234567890', '98765', '', 'abcdefghij', '+1 9876543210']) expect(normaliseIndianMobile(v)).toBeNull()
  })
})

describe('addressSchema', () => {
  const ok = { fullName: 'A', phone: '9876543210', line1: 'x', city: 'Pune', state: 'Maharashtra', pincode: '411001' }
  it('accepts a valid address and blanks optional fields', () => {
    expect(addressSchema.parse({ ...ok, line2: '' })).toMatchObject({ line2: null, landmark: null })
  })
  it('rejects a bad PIN code or an unknown state', () => {
    expect(addressSchema.safeParse({ ...ok, pincode: '011001' }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, state: 'Atlantis' }).success).toBe(false)
  })
})

describe('parseCommerceSettings', () => {
  it('turns COD off unless it is explicitly true, and ignores bad numbers', () => {
    const s = parseCommerceSettings([
      { key: 'cod.enabled', value: 'yes' },
      { key: 'shipping.flatPaise', value: -5 },
      { key: 'shipping.freeAbovePaise', value: null },
    ])
    expect(s).toMatchObject({ codEnabled: false, shippingFlatPaise: 0, shippingFreeAbovePaise: null })
  })
})

describe('paymentOptions', () => {
  const s = { shippingFlatPaise: 0, shippingFreeAbovePaise: null, codEnabled: true, codFeePaise: 0, codMinOrderPaise: 20_000, codMaxOrderPaise: 100_000 }
  it('offers COD only inside its limits', () => {
    expect(paymentOptions(50_000, s, false).cod).toBe(true)
    expect(paymentOptions(10_000, s, false).cod).toBe(false)
    expect(paymentOptions(200_000, s, false).cod).toBe(false)
    expect(paymentOptions(50_000, { ...s, codEnabled: false }, true)).toMatchObject({ cod: false, online: true })
  })
})
