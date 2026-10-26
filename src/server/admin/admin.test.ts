import { describe, expect, it } from 'vitest'
import { can } from './access'
import { startOfTodayIST } from './dashboard'
import { parseSettingInput } from './settings'

describe('can', () => {
  it('gives each role only its capabilities', () => {
    expect(can('CUSTOMER', 'dashboard.view')).toBe(false)
    expect(can(null, 'orders.view')).toBe(false)
    expect(can('STAFF', 'orders.update')).toBe(true)
    expect(can('STAFF', 'orders.cancel')).toBe(false)
    expect(can('ADMIN', 'orders.cancel')).toBe(true)
    expect(can('ADMIN', 'settings.edit')).toBe(false)
    expect(can('OWNER', 'settings.edit')).toBe(true)
  })
})

describe('parseSettingInput', () => {
  it('reads rupees as paise, and empty as "never" only where allowed', () => {
    expect(parseSettingInput('shipping.flatPaise', '79.50')).toEqual({ ok: true, value: 7_950 })
    expect(parseSettingInput('shipping.flatPaise', '')).toMatchObject({ ok: false })
    expect(parseSettingInput('shipping.freeAbovePaise', '')).toEqual({ ok: true, value: null })
    expect(parseSettingInput('cod.feePaise', '-1')).toMatchObject({ ok: false })
  })
  it('handles checkboxes, days and choices', () => {
    expect(parseSettingInput('cod.enabled', 'on')).toEqual({ ok: true, value: true })
    expect(parseSettingInput('cod.enabled', null)).toEqual({ ok: true, value: false })
    expect(parseSettingInput('returns.windowDays', '7')).toEqual({ ok: true, value: 7 })
    expect(parseSettingInput('returns.windowDays', '7.5')).toMatchObject({ ok: false })
    expect(parseSettingInput('cancellation.allowedUntil', 'BEFORE_SHIPMENT')).toEqual({ ok: true, value: 'BEFORE_SHIPMENT' })
    expect(parseSettingInput('cancellation.allowedUntil', 'WHENEVER')).toMatchObject({ ok: false })
  })
  it('checks GSTIN format but allows leaving it empty', () => {
    expect(parseSettingInput('business.gstin', '09abcde1234f1z5')).toEqual({ ok: true, value: '09ABCDE1234F1Z5' })
    expect(parseSettingInput('business.gstin', '')).toEqual({ ok: true, value: '' })
    expect(parseSettingInput('business.gstin', 'NOT-A-GSTIN')).toMatchObject({ ok: false })
  })
  it('refuses keys it does not know', () => {
    expect(parseSettingInput('admin.backdoor', 'x')).toMatchObject({ ok: false })
  })
})

describe('startOfTodayIST', () => {
  it('is 18:30 UTC the previous day', () => {
    expect(startOfTodayIST(new Date('2026-10-26T20:00:00Z')).toISOString()).toBe('2026-10-26T18:30:00.000Z')
    expect(startOfTodayIST(new Date('2026-10-26T10:00:00Z')).toISOString()).toBe('2026-10-25T18:30:00.000Z')
  })
})
