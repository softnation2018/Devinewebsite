import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeHref } from './markdown'

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and lists', () => {
    const blocks = parseMarkdown('# Returns\n\nWe accept returns\nwithin the window.\n\n- Unused\n- In original packing\n\n1. Write to us\n2. Ship it back')
    expect(blocks.map((b) => b.t)).toEqual(['h', 'p', 'ul', 'ol'])
    expect(blocks[0]).toMatchObject({ level: 2 })
    expect(blocks[1]).toEqual({ t: 'p', c: [{ t: 'text', v: 'We accept returns within the window.' }] })
    expect(blocks[2]).toMatchObject({ items: [[{ v: 'Unused' }], [{ v: 'In original packing' }]] })
  })
  it('keeps HTML as text and drops unsafe links', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ t: 'text', v: '<script>alert(1)</script>' }])
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ t: 'text', v: 'click' }])
    expect(parseInline('[mail](mailto:help@example.com) and **bold**')).toEqual([
      { t: 'link', href: 'mailto:help@example.com', c: [{ t: 'text', v: 'mail' }] },
      { t: 'text', v: ' and ' },
      { t: 'strong', c: [{ t: 'text', v: 'bold' }] },
    ])
    expect(safeHref('//evil.example')).toBeNull()
    expect(safeHref('http://plain.example')).toBeNull()
    expect(safeHref('/policies/returns')).toBe('/policies/returns')
  })
})
