import Link from 'next/link'

export type Crumb = { name: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs tracking-wide text-stone">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={c.name} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-maroon-800">
                {c.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-charcoal">
                {c.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
