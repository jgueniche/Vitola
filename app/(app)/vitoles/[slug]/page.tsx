import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { CigarCard } from '@/components/cigar/cigar-card'
import { RingGauge } from '@/components/data/ring-gauge'
import { EmptyState } from '@/components/layout/empty-state'
import { shapeLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { getVitolaBySlug } from '@/lib/referential/queries'
import { EMPTY_FACETS } from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const vitola = await getVitolaBySlug(slug)
  return { title: vitola?.name_salida ?? m.referential.vitolasTitle }
}

export default async function VitolaPage({ params }: Params) {
  const { slug } = await params
  const [vitola, result] = await Promise.all([
    getVitolaBySlug(slug),
    searchCigars({ ...EMPTY_FACETS, vitola: slug }),
  ])
  if (!vitola) notFound()
  const toVerify = vitola.notes?.startsWith(m.referential.vitola.toVerify) ?? false

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.referential.vitolasTitle}</p>
        <h1 className="font-display text-4xl leading-tight">{vitola.name_salida}</h1>
        {vitola.name_galera ? (
          <p className="text-ink-muted text-sm">
            {m.referential.vitola.galera} · {vitola.name_galera}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-10">
        <RingGauge ringGauge={vitola.ring_gauge} lengthMm={vitola.length_mm} withSilhouette />
        <p className="text-ink-muted text-sm">
          {m.referential.vitola.shape} · {shapeLabel(vitola.shape)}
        </p>
      </div>

      {/* Surfaced, not hidden: these are the 14 entries a reviewer should look
          at first, and PROVENANCE.md §5 puts them at the top of the list. */}
      {toVerify ? (
        <p className="border-caution text-caution rounded-[3px] border px-4 py-3 text-sm">
          {vitola.notes}
        </p>
      ) : null}

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        {result.total === 0 ? (
          <EmptyState
            title={m.referential.vitola.noCigars}
            description={m.referential.results.emptyBody}
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {result.cigars.map((cigar) => (
              <li key={cigar.id}>
                <CigarCard cigar={cigar} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
