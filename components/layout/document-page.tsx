import type { ReactNode } from 'react'

import { Band } from '@/components/band/band'

/** Shared shell for legal and informational documents. Reading measure capped at 68ch (§4.5). */
export function DocumentPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display text-4xl">{title}</h1>
      </div>
      <Band variant="divider" />
      <div className="measure text-ink-muted flex flex-col gap-4 leading-relaxed">{children}</div>
    </main>
  )
}
