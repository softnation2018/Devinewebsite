import { type Block, type Inline, parseMarkdown } from '@/lib/markdown'

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    if (n.t === 'text') return n.v
    if (n.t === 'strong') return <strong key={i}>{<Inlines nodes={n.c} />}</strong>
    if (n.t === 'em') return <em key={i}>{<Inlines nodes={n.c} />}</em>
    const external = n.href.startsWith('https://')
    return (
      <a key={i} href={n.href} className="text-maroon-800 underline underline-offset-2" {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
        <Inlines nodes={n.c} />
      </a>
    )
  })
}

function BlockView({ b }: { b: Block }) {
  if (b.t === 'h') {
    const H = `h${b.level}` as const
    return <H className="pt-4 font-serif text-2xl text-maroon-900">{<Inlines nodes={b.c} />}</H>
  }
  if (b.t === 'p') return <p>{<Inlines nodes={b.c} />}</p>
  const L = b.t
  return (
    <L className={`space-y-1 pl-6 ${L === 'ul' ? 'list-disc' : 'list-decimal'}`}>
      {b.items.map((item, i) => (
        <li key={i}>
          <Inlines nodes={item} />
        </li>
      ))}
    </L>
  )
}

/** Renders owner-written Markdown as plain React elements (never as raw HTML). */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {parseMarkdown(source).map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  )
}
