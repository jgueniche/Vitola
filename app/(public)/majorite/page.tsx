import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'

import { AgeGateForm } from './age-gate-form'

export const metadata: Metadata = {
  title: 'Accès réservé aux majeurs',
  robots: { index: false, follow: false },
}

export default async function AgeGatePage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>
}) {
  const { suite } = await searchParams

  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-20">
      <div className="flex flex-col gap-4">
        <p className="eyebrow">{m.ageGate.eyebrow}</p>
        <h1 className="font-display text-4xl">{m.ageGate.title}</h1>
        <p className="text-ink-muted measure leading-relaxed">{m.ageGate.lede}</p>
      </div>

      <Band variant="divider" />

      <AgeGateForm suite={suite ?? ''} />

      <p className="text-ink-muted measure text-xs leading-relaxed">{m.ageGate.privacy}</p>
    </main>
  )
}
