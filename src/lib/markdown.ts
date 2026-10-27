// A deliberately small Markdown reader for policy and content pages:
// headings, paragraphs, bullet and numbered lists, **bold**, *italic* and
// [links](https://…). It produces a plain tree that React renders as text,
// so no HTML typed into a page can ever run in a visitor's browser.

export type Inline = { t: 'text'; v: string } | { t: 'strong'; c: Inline[] } | { t: 'em'; c: Inline[] } | { t: 'link'; href: string; c: Inline[] }
export type Block =
  | { t: 'h'; level: 2 | 3 | 4; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }

/** Only web, email, phone and same-site links. Anything else becomes plain text. */
export function safeHref(href: string): string | null {
  const h = href.trim()
  if (/^https:\/\/[^\s<>"]+$/i.test(h) || /^mailto:[^\s<>"]+$/i.test(h) || /^tel:\+?[\d\s-]+$/i.test(h)) return h
  if (/^\/(?!\/)[^\s<>"]*$/.test(h)) return h
  return null
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let rest = src
  const push = (v: string) => {
    if (!v) return
    const last = out[out.length - 1]
    if (last?.t === 'text') last.v += v
    else out.push({ t: 'text', v })
  }
  while (rest) {
    const link = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest)
    if (link) {
      const href = safeHref(link[2])
      if (href) out.push({ t: 'link', href, c: parseInline(link[1]) })
      else push(link[1])
      rest = rest.slice(link[0].length)
      continue
    }
    const strong = /^\*\*([^*]+)\*\*/.exec(rest)
    if (strong) {
      out.push({ t: 'strong', c: parseInline(strong[1]) })
      rest = rest.slice(strong[0].length)
      continue
    }
    const em = /^\*([^*]+)\*/.exec(rest) ?? /^_([^_]+)_/.exec(rest)
    if (em) {
      out.push({ t: 'em', c: parseInline(em[1]) })
      rest = rest.slice(em[0].length)
      continue
    }
    const next = rest.slice(1).search(/[[*_]/)
    const cut = next === -1 ? rest.length : next + 1
    push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  return out
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) })
    para = []
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) })
    list = null
  }
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      // The page title is the only h1, so "#" becomes a section heading.
      blocks.push({ t: 'h', level: Math.min(4, Math.max(2, h[1].length + (h[1].length === 1 ? 1 : 0))) as 2 | 3 | 4, c: parseInline(h[2]) })
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d{1,3}[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      if (para.length || (list && list.t !== kind)) flush()
      list ??= { t: kind, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    if (list) flush()
    para.push(line)
  }
  flush()
  return blocks
}
