import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'

export const metadata: Metadata = { title: 'Cigares' }

/**
 * Placeholder until P1.
 *
 * It exists because the age gate lands here by default: without it, an adult who
 * clears the gate reaches a 404, which is a worse first impression than an
 * honest empty state. Replaced by the faceted search in P1.
 */
export default function CigarsPage() {
  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Référentiel</p>
        <h1 className="font-display text-4xl">Cigares</h1>
      </div>

      <Band variant="divider" />

      <EmptyState
        title="Le référentiel n’est pas encore ouvert"
        description="La recherche facettée, les fiches et le vitolario arrivent avec la phase suivante. Rien n’est encore en base."
      />
    </main>
  )
}
