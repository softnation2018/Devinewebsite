import { formatPaise } from '@/lib/money'

export function Price({
  pricePaise,
  compareAtPaise,
  size = 'md',
  from = false,
}: {
  pricePaise: number
  compareAtPaise: number | null
  size?: 'md' | 'lg'
  /** Options are priced differently; this is the lowest. */
  from?: boolean
}) {
  const onSale = compareAtPaise !== null && compareAtPaise > pricePaise
  const main = size === 'lg' ? 'text-2xl' : 'text-base'
  return (
    <p className="flex items-baseline gap-2">
      <span className={`${main} font-semibold text-maroon-900`}>
        {from && <span className="text-sm font-normal text-stone">From </span>}
        {formatPaise(pricePaise)}
      </span>
      {onSale && (
        <>
          <span className="text-sm text-stone line-through">
            <span className="sr-only">Was </span>
            {formatPaise(compareAtPaise)}
          </span>
          <span className="text-xs font-medium text-maroon-700">
            Save {formatPaise(compareAtPaise - pricePaise)}
          </span>
        </>
      )}
    </p>
  )
}
