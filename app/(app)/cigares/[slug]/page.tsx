import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { RingGauge } from '@/components/data/ring-gauge'
import { StrengthMeter, type Strength } from '@/components/data/strength-meter'
import { WrapperScale, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel, formatEffectiveDate, formatPrice, shapeLabel } from '@/lib/cigar'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { getCigarBySlug } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'

import { CommentThread } from './comment-thread'
import { FeedSection } from './feed-section'
import { HumidorSection } from './humidor-section'
import { NotebookSection } from './notebook-section'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const cigar = await getCigarBySlug(slug)
  if (!cigar) return { title: m.referential.cigarsTitle }

  const brand = cigar.brands?.name
  return { title: brand ? `${brand} ${cigar.commercial_name}` : cigar.commercial_name }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:gap-6">
      <dt className="text-ink-muted w-48 shrink-0 text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/**
 * The cigar entry (§10.2 wireframe, P1).
 *
 * `notFound()` covers both "no such slug" and "exists but is still a draft":
 * the query filters on `status = 'published'`, so an unpublished entry is
 * indistinguishable from a missing one. That is deliberate — revealing that a
 * draft exists at a given slug would leak the referential's unreviewed contents
 * one 404 at a time.
 */
export default async function CigarPage({ params }: Params) {
  const { slug } = await params
  const cigar = await getCigarBySlug(slug)
  if (!cigar) notFound()

  const vitola = cigar.vitolas

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        {cigar.brands ? (
          <Link href={routes.brand(cigar.brands.slug)} className="eyebrow hover:text-accent-bright">
            {cigar.brands.name}
          </Link>
        ) : null}
        <h1 className="font-display text-4xl leading-tight">{cigar.commercial_name}</h1>
        {cigar.lines ? <p className="text-ink-muted text-sm">{cigar.lines.name}</p> : null}
      </div>

      <Band variant="divider" />

      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        {vitola ? (
          <RingGauge ringGauge={vitola.ring_gauge} lengthMm={vitola.length_mm} withSilhouette />
        ) : null}
        {cigar.strength ? <StrengthMeter strength={cigar.strength as Strength} /> : null}
        {cigar.wrapper_shade ? (
          <WrapperScale shade={cigar.wrapper_shade as WrapperShade} />
        ) : null}
      </div>

      <dl className="flex flex-col">
        {vitola ? (
          <Row label={m.referential.cigar.vitola}>
            <Link
              href={routes.vitola(vitola.slug)}
              className="underline underline-offset-4 hover:no-underline"
            >
              {vitola.name_salida}
            </Link>
            {vitola.name_galera ? (
              <span className="text-ink-muted"> · {vitola.name_galera}</span>
            ) : null}
            <span className="text-ink-muted"> · {shapeLabel(vitola.shape)}</span>
          </Row>
        ) : (
          <Row label={m.referential.cigar.vitola}>
            <span className="text-ink-faint">{m.referential.cigar.noVitola}</span>
          </Row>
        )}

        {cigar.origin_country ? (
          <Row label={m.referential.cigar.origin}>{countryLabel(cigar.origin_country)}</Row>
        ) : null}

        {cigar.release_year ? (
          <Row label={m.referential.cigar.releaseYear}>{cigar.release_year}</Row>
        ) : null}

        {/* The price and its effective date are one fact, never two. The table
            refuses a price without a source and a date; so does this page. */}
        {cigar.msrp_eur !== null && cigar.msrp_effective_on ? (
          <Row label={m.referential.cigar.price}>
            <span className="font-mono">{formatPrice(cigar.msrp_eur)}</span>
            <p className="text-ink-faint mt-1 text-xs">
              {m.referential.cigar.priceNote.replace(
                '{date}',
                formatEffectiveDate(cigar.msrp_effective_on),
              )}
            </p>
          </Row>
        ) : null}
      </dl>

      {/* The two wiki doors, under the characteristics they act on. A
          correction is proposed while looking at what is wrong, and the history
          is where one checks whether somebody already noticed. */}
      <div className="flex flex-wrap gap-3">
        <Link href={routes.cigarPropose(cigar.slug)}>
          <Button variant="secondary" size="sm">
            {m.contributions.proposeLink}
          </Button>
        </Link>
        <Link href={routes.cigarHistory(cigar.slug)}>
          <Button variant="ghost" size="sm">
            {m.contributions.historyLink}
          </Button>
        </Link>
      </div>

      {/* Before the notebook, because it is the earlier gesture: one takes the
          cigar out, then writes about it. The section renders nothing at all
          for a visitor with no humidor. */}
      <HumidorSection cigarId={cigar.id} slug={cigar.slug} />

      <NotebookSection cigarId={cigar.id} slug={cigar.slug} />

      {/* Le fil after the notebook, and the order is the argument the notebook
          section already makes one level down: the private gesture comes first
          because it is the one that costs nothing to make, and the public one
          second because it is the one worth thinking about. */}
      <FeedSection cigarId={cigar.id} slug={cigar.slug} />

      <CommentThread cigarId={cigar.id} slug={cigar.slug} />
    </main>
  )
}
