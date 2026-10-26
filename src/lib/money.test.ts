import { describe, expect, it } from 'vitest'
import { formatPaise, paiseToRupeeInput, parseRupeesToPaise } from './money'

describe('formatPaise', () => {
  it('formats whole rupees with Indian digit grouping', () => {
    expect(formatPaise(149_900)).toBe('₹1,499')
    expect(formatPaise(1_00_00_000_00)).toBe('₹1,00,00,000')
  })

  it('shows paise only when there are any', () => {
    expect(formatPaise(15_050)).toBe('₹150.50')
    expect(formatPaise(15_055)).toBe('₹150.55')
  })
})

describe('parseRupeesToPaise', () => {
  it('parses what staff type without floating-point error', () => {
    expect(parseRupeesToPaise('79')).toBe(7_900)
    expect(parseRupeesToPaise('79.5')).toBe(7_950)
    expect(parseRupeesToPaise('₹1,499.99')).toBe(149_999)
    expect(parseRupeesToPaise('0.07')).toBe(7)
    expect(parseRupeesToPaise(' 10 ')).toBe(1_000)
  })
  it('rejects negatives, three decimals and junk', () => {
    for (const v of ['-5', '1.234', 'abc', '', '1e3', '.5']) expect(parseRupeesToPaise(v)).toBeNull()
  })
  it('round-trips with paiseToRupeeInput', () => {
    for (const p of [0, 7, 7_900, 7_950, 149_999]) expect(parseRupeesToPaise(paiseToRupeeInput(p))).toBe(p)
  })
})
