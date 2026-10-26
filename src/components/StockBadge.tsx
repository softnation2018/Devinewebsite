// Shows real stock from the database. It never invents urgency: the
// "only N left" message appears only at or below the product's own
// low-stock threshold, and states the true number.
export function StockBadge({ available, lowStockThreshold = 3 }: { available: number; lowStockThreshold?: number }) {
  if (available <= 0) {
    return <span className="text-sm font-medium text-stone">Out of stock</span>
  }
  if (available <= lowStockThreshold) {
    return <span className="text-sm font-medium text-maroon-700">Only {available} left in stock</span>
  }
  return <span className="text-sm font-medium text-emerald-800">In stock</span>
}
