import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { RingGauge } from '@/components/data/ring-gauge'
import { STRENGTHS, StrengthMeter } from '@/components/data/strength-meter'
import { WRAPPER_SHADES, WrapperScale } from '@/components/data/wrapper-scale'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'

export const metadata: Metadata = { title: 'Primitives' }

/**
 * Live gallery of the design system, served by the app itself.
 *
 * Storybook (the exit criterion of P0) isolates each primitive; this page shows
 * them in the real runtime, with the real fonts and the real theme switching.
 * The two are complementary, and this one cannot drift from production.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="eyebrow">{title}</p>
      <div className="border-rule bg-surface flex flex-col gap-6 rounded-[3px] border p-6">
        {children}
      </div>
    </section>
  )
}

export default function PrimitivesPage() {
  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-16">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Design system</p>
        <h1 className="font-display text-4xl">Primitives</h1>
      </div>

      <Section title="Bague — élément signature">
        <Band brand="Cohíba" vitola="Siglo VI" />
        <Band variant="divider" />
        <Band variant="badge" brand="Archiviste" />
        <Band variant="viewfinder">
          <span className="text-ink-muted text-sm">Cadre de visée du scan</span>
        </Band>
      </Section>

      <Section title="Typographie">
        <p className="font-display text-5xl">Siglo VI</p>
        <p className="eyebrow">Cepo × longueur</p>
        <p className="text-base">
          Corps Inter, chiffres tabulaires : 0123456789 alignés en colonne.
        </p>
        <p className="font-mono text-sm">MSU JUN 19 · 52 × 150 mm</p>
      </Section>

      <Section title="Échelle de cape">
        {WRAPPER_SHADES.map((shade) => (
          <WrapperScale key={shade} shade={shade} />
        ))}
      </Section>

      <Section title="Force">
        {STRENGTHS.map((strength) => (
          <StrengthMeter key={strength} strength={strength} />
        ))}
      </Section>

      <Section title="Dimensions">
        <RingGauge ringGauge={38} lengthMm={192} withSilhouette />
        <RingGauge ringGauge={52} lengthMm={150} withSilhouette />
        <RingGauge ringGauge={56} lengthMm={124} withSilhouette />
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Ajouter à la cave</Button>
          <Button variant="secondary">Comparer</Button>
          <Button variant="ghost">Voir l&apos;historique</Button>
        </div>
      </Section>

      <Section title="Champs">
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="demo">Code de boîte</Label>
          <Input id="demo" placeholder="MSU JUN 19" />
        </div>
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="demo-error">Code de boîte</Label>
          <Input id="demo-error" aria-invalid defaultValue="XX" />
          <FieldError>Ce code ne correspond à aucune usine connue.</FieldError>
        </div>
      </Section>

      <Section title="État vide">
        <EmptyState
          title="Cave vide"
          description="Votre cave est vide. Scannez une bague ou cherchez une vitole pour commencer."
          action={<Button variant="secondary">Chercher une vitole</Button>}
        />
      </Section>
    </main>
  )
}
