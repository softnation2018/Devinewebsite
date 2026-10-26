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
