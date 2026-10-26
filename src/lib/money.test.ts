import { describe, expect, it } from 'vitest'
import { formatPaise } from './money'

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
