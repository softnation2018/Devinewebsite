import { describe, expect, it } from 'vitest'
import { parseSupportSettings, whatsappLink } from './settings'

describe('support settings', () => {
  it('treats missing or non-text values as not set', () => {
    expect(parseSupportSettings([{ key: 'support.email', value: ' help@example.test ' }, { key: 'support.phone', value: 42 }])).toEqual({
      email: 'help@example.test',
      phone: '',
      whatsapp: '',
      hours: '',
    })
  })

  it('builds wa.me links from Indian and international numbers', () => {
    expect(whatsappLink('98765 43210')).toBe('https://wa.me/919876543210')
    expect(whatsappLink('+91 98765-43210')).toBe('https://wa.me/919876543210')
    expect(whatsappLink('+44 20 7946 0958')).toBe('https://wa.me/442079460958')
    expect(whatsappLink('12345')).toBeNull()
  })
})
