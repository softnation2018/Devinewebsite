const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formats integer paise as rupees: 149900 → "₹1,499", 15050 → "₹150.50". */
export function formatPaise(paise: number): string {
  return (paise % 100 === 0 ? wholeRupees : withPaise).format(paise / 100)
}

/**
 * Parses a rupee amount typed by staff ("79", "79.5", "1,499.00") into
 * integer paise. Returns null for anything else, including negatives.
 * Done on the string, never with floating-point multiplication.
 */
export function parseRupeesToPaise(input: string): number | null {
  const s = input.trim().replace(/[₹,\s]/g, '')
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/** Paise as a plain rupee string for form fields: 7950 → "79.50", 7900 → "79". */
export function paiseToRupeeInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}
