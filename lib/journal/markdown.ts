/**
 * The bounded Markdown subset of ADR 0012, D2 — parsed to a typed tree, never
 * to HTML.
 *
 * What it knows: `##` and `###` headings, paragraphs, `-` lists, `>` quotes,
 * `**strong**`, `*emphasis*`, and `[text](https://…)` links. What it refuses,
 * it refuses by NOT knowing it: raw HTML, `javascript:` links, images, code —
 * anything unrecognised renders literally as text, so an article can look
 * plain but can never execute. The renderer (components/journal/markdown.tsx)
 * maps this tree to React elements; React escapes every text node, and
 * `dangerouslySetInnerHTML` appears nowhere in the chain.
 *
 * A hand-written parser is a classic risk; this one is bearable because the
 * grammar is small, closed, and pinned by `tests/unit/journal-markdown.test.ts`
 * — injection cases included. The day the subset feels narrow, ADR 0012 names
 * the exit (react-markdown), and it is a change of renderer, not of schema.
 */

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'em'; children: InlineNode[] }
  | { kind: 'link'; href: string; children: InlineNode[] }

export type BlockNode =
  | { kind: 'heading'; level: 2 | 3; children: InlineNode[] }
  | { kind: 'paragraph'; children: InlineNode[] }
  | { kind: 'list'; items: InlineNode[][] }
  | { kind: 'quote'; children: InlineNode[] }

/* Earliest match wins; the inner text of a link stays plain (a link inside a
   link is a phrase nobody writes on purpose), strong and em recurse. */
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/
const STRONG = /\*\*([^*\n]+)\*\*/
const EM = /\*([^*\n]+)\*/

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let rest = text

  while (rest.length > 0) {
    const candidates = [
      { match: LINK.exec(rest), kind: 'link' as const },
      { match: STRONG.exec(rest), kind: 'strong' as const },
      { match: EM.exec(rest), kind: 'em' as const },
    ].filter((c): c is { match: RegExpExecArray; kind: 'link' | 'strong' | 'em' } => c.match !== null)

    if (candidates.length === 0) {
      nodes.push({ kind: 'text', text: rest })
      break
    }

    candidates.sort((a, b) => a.match.index - b.match.index)
    const first = candidates[0]!
    const { match, kind } = first

    if (match.index > 0) nodes.push({ kind: 'text', text: rest.slice(0, match.index) })

    if (kind === 'link') {
      nodes.push({ kind: 'link', href: match[2]!, children: [{ kind: 'text', text: match[1]! }] })
    } else if (kind === 'strong') {
      nodes.push({ kind: 'strong', children: parseInline(match[1]!) })
    } else {
      nodes.push({ kind: 'em', children: parseInline(match[1]!) })
    }

    rest = rest.slice(match.index + match[0].length)
  }

  return nodes
}

export function parseArticle(bodyMd: string): BlockNode[] {
  const blocks: BlockNode[] = []
  const lines = bodyMd.replace(/\r\n/g, '\n').split('\n')

  let paragraph: string[] = []
  let list: string[] = []
  let quote: string[] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) })
      paragraph = []
    }
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list.map((item) => parseInline(item)) })
      list = []
    }
    if (quote.length > 0) {
      blocks.push({ kind: 'quote', children: parseInline(quote.join(' ')) })
      quote = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim().length === 0) {
      flush()
      continue
    }

    if (line.startsWith('### ')) {
      flush()
      blocks.push({ kind: 'heading', level: 3, children: parseInline(line.slice(4).trim()) })
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'heading', level: 2, children: parseInline(line.slice(3).trim()) })
      continue
    }
    if (line.startsWith('- ')) {
      if (paragraph.length > 0 || quote.length > 0) flush()
      list.push(line.slice(2).trim())
      continue
    }
    if (line.startsWith('> ')) {
      if (paragraph.length > 0 || list.length > 0) flush()
      quote.push(line.slice(2).trim())
      continue
    }

    if (list.length > 0 || quote.length > 0) flush()
    paragraph.push(line.trim())
  }

  flush()
  return blocks
}

/** The plain text of a tree — what the RSS description and tests read. */
export function plainText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.text : plainText(node.children)))
    .join('')
}
