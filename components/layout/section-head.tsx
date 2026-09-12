import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The head of a page or of a section: an eyebrow, a title, and — only when it
 * earns it — one line under it.
 *
 * Seventeen screens wrote this block out by hand, always the same way and
 * always with a lede, because the pattern made one look mandatory. The QA
 * session of 12 septembre 2026 named the result: « il me faut beaucoup moins
 * de texte, mettre en avant les titres, moins les descriptions ». So the lede
 * is optional here and absent by default, and it renders through `.lede` —
 * two notches under the title rather than one.
 *
 * `level` is the heading level, not a size: a page head is an h1 and a
 * section head is an h2, and they must not be chosen by how big they should
 * look. `size` picks the size.
 */
export function SectionHead({
  eyebrow,
  title,
  lede,
  aside,
  level = 'h1',
  size = 'md',
  id,
  className,
}: {
  eyebrow?: string
  title: string
  /** Omit it. Include it only when a reader cannot act without the sentence. */
  lede?: string
  /** A link or a count, aligned with the title on a wide screen. */
  aside?: ReactNode
  level?: 'h1' | 'h2'
  size?: 'sm' | 'md'
  id?: string
  className?: string
}) {
  const Heading = level

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Heading
          id={id}
          className={cn(
            'font-display leading-tight',
            size === 'md' ? 'text-display-md' : 'text-display-sm',
          )}
        >
          {title}
        </Heading>
        {aside ? <div className="text-sm">{aside}</div> : null}
      </div>
      {lede ? <p className="lede">{lede}</p> : null}
    </div>
  )
}
