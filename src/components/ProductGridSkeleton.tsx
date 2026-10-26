export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="animate-pulse rounded-sm border border-gold-100 bg-white">
          <div className="aspect-square bg-ivory" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 bg-ivory" />
            <div className="h-4 w-4/5 bg-ivory" />
            <div className="h-4 w-1/4 bg-ivory" />
          </div>
        </li>
      ))}
    </ul>
  )
}
