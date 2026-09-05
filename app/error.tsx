'use client'

import { Button } from '@/components/ui/button'

/**
 * Global error boundary. Sober tone, no apology theatre, no "Oops" (§4.6).
 * The error message itself is never shown: it can leak internals.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
      <p className="eyebrow">Erreur</p>
      <h1 className="font-display text-display-md">Quelque chose n&apos;a pas abouti.</h1>
      <p className="text-ink-muted measure">
        L&apos;incident a été enregistré. Vous pouvez réessayer immédiatement.
      </p>
      <div>
        <Button onClick={reset}>Réessayer</Button>
      </div>
    </main>
  )
}
