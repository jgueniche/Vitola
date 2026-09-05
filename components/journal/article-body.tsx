import type { BlockNode, InlineNode } from '@/lib/journal/markdown'

/**
 * The renderer half of ADR 0012, D2: the typed tree becomes React elements,
 * React escapes every text node, and `dangerouslySetInnerHTML` appears
 * nowhere. External links open elsewhere and never pass a referrer — an
 * article's reader is not something we hand to the sites it cites.
 */

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'text':
            return <span key={index}>{node.text}</span>
          case 'strong':
            return (
              <strong key={index} className="text-ink font-semibold">
                <Inline nodes={node.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={index}>
                <Inline nodes={node.children} />
              </em>
            )
          case 'link':
            return (
              <a
                key={index}
                href={node.href}
                rel="nofollow noopener noreferrer"
                target="_blank"
                className="text-accent hover:underline"
              >
                <Inline nodes={node.children} />
              </a>
            )
        }
      })}
    </>
  )
}

export function ArticleBody({ blocks }: { blocks: readonly BlockNode[] }) {
  return (
    <div className="measure flex flex-col gap-5">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={index} className="font-display text-display-sm mt-4 leading-snug">
                <Inline nodes={block.children} />
              </h2>
            ) : (
              <h3 key={index} className="mt-2 text-base leading-snug font-medium">
                <Inline nodes={block.children} />
              </h3>
            )
          case 'paragraph':
            return (
              <p key={index} className="text-sm leading-relaxed">
                <Inline nodes={block.children} />
              </p>
            )
          case 'list':
            return (
              <ul
                key={index}
                className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline nodes={item} />
                  </li>
                ))}
              </ul>
            )
          case 'quote':
            return (
              <blockquote
                key={index}
                className="border-accent text-ink-muted border-l-2 pl-4 text-sm leading-relaxed italic"
              >
                <Inline nodes={block.children} />
              </blockquote>
            )
        }
      })}
    </div>
  )
}
