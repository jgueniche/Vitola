import { describe, expect, it } from 'vitest'

import { parseArticle, parseInline, plainText } from '@/lib/journal/markdown'

/**
 * The bounded subset of ADR 0012, D2 — and above all what it refuses.
 *
 * A hand-written parser is a classic risk; these tests are the fence. The
 * injection cases matter more than the structure ones: the whole point of
 * refusing MDX was that an article can never execute, so raw HTML must come
 * out as text nodes and a `javascript:` URL must never become a link.
 */

describe('structure', () => {
  it('splits headings, paragraphs, lists and quotes', () => {
    const blocks = parseArticle(
      ['## Titre', '', 'Un paragraphe', 'sur deux lignes.', '', '- un', '- deux', '', '> citée'].join(
        '\n',
      ),
    )
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'quote'])
    expect(blocks[1]).toMatchObject({
      children: [{ kind: 'text', text: 'Un paragraphe sur deux lignes.' }],
    })
    expect(blocks[2]).toMatchObject({
      items: [[{ kind: 'text', text: 'un' }], [{ kind: 'text', text: 'deux' }]] as unknown,
    })
  })

  it('reads ### as the deeper heading, not as ## plus a hash', () => {
    const blocks = parseArticle('### Sous-titre')
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 3 })
  })

  it('parses strong before em when they overlap', () => {
    const nodes = parseInline('du **gras** et de *l’italique*')
    expect(nodes.map((node) => node.kind)).toEqual(['text', 'strong', 'text', 'em'])
  })

  it('keeps an https link, text and target', () => {
    const nodes = parseInline('voir [la source](https://exemple.fr/page) ici')
    expect(nodes[1]).toMatchObject({ kind: 'link', href: 'https://exemple.fr/page' })
  })
})

describe('what it refuses, it refuses by not knowing it', () => {
  it('renders raw HTML as text, never as markup', () => {
    const blocks = parseArticle('<script>alert(1)</script>')
    expect(blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [{ kind: 'text', text: '<script>alert(1)</script>' }],
    })
  })

  it('never makes a link from a javascript: URL', () => {
    const nodes = parseInline('[clic](javascript:alert(1))')
    expect(nodes.every((node) => node.kind === 'text')).toBe(true)
  })

  it('never makes a link from a relative path — a public article cannot point behind the gate', () => {
    const nodes = parseInline('[fiche](/cigares/undercrown-10)')
    expect(nodes.every((node) => node.kind === 'text')).toBe(true)
  })

  it('renders an image attempt literally', () => {
    const nodes = parseInline('![alt](https://exemple.fr/x.png)')
    // The leading `!` stays text; the [..](..) behind it still parses as a
    // link, which displays a URL — ugly, harmless, and honest.
    expect(nodes[0]).toMatchObject({ kind: 'text', text: '!' })
  })
})

describe('plainText', () => {
  it('flattens a tree back to its words', () => {
    expect(plainText(parseInline('du **gras** et [un lien](https://x.fr)'))).toBe(
      'du gras et un lien',
    )
  })
})
