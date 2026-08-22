import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { CigarCard } from '@/components/cigar/cigar-card'
import { EmptyState } from '@/components/layout/empty-state'
import { countryLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { getBrandBySlug } from '@/lib/referential/queries'
import { EMPTY_FACETS } from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const brand = await getBrandBySlug(slug)
  return { title: brand?.name ?? m.referential.brandsTitle }
}

/**
 * A brand page: what the brand is, and the entries published under it.
 *
 * The entry list reuses the faceted search rather than its own query, so the
 * two can never disagree about what "published" means.
 */
export default async function BrandPage({ params }: Params) {
  const { slug } = await params
  // Both reads only need the slug, so they go out together. Sequentially they
  // cost two round trips to eu-west-3 before anything renders, which is most of
  // the page's time budget spent waiting rather than working.
  const [brand, result] = await Promise.all([
    getBrandBySlug(slug),
    searchCigars({ ...EMPTY_FACETS, brand: slug }),
  ])
  if (!brand) notFound()

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">
          {brand.is_cuban ? m.referential.brand.cuban : m.referential.brandsTitle}
        </p>
        <h1 className="font-display text-4xl leading-tight">{brand.name}</h1>
        <p className="text-ink-muted text-sm">
          {brand.country ? countryLabel(brand.country) : null}
          {brand.founded_year
            ? ` · ${m.referential.brand.founded.replace('{year}', String(brand.founded_year))}`
            : null}
          {brand.manufacturers ? ` · ${brand.manufacturers.name}` : null}
        </p>
      </div>

      {brand.description ? (
        <p className="measure text-ink-muted text-sm leading-relaxed">{brand.description}</p>
      ) : null}

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl">{m.referential.brand.cigarCount}</h2>
        {result.total === 0 ? (
          <EmptyState
            title={m.referential.brand.noCigars}
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
