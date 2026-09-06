import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { SpecStrip } from '@/components/data/spec-strip'
import type { Strength } from '@/components/data/strength-meter'
import type { WrapperShade } from '@/components/data/wrapper-scale'
import { EntryRow } from '@/components/reviews/entry-row'
import { StatsPanel } from '@/components/reviews/stats-panel'
import {
  countryLabel,
  formatEffectiveDate,
  formatPrice,
  releaseTypeLabel,
  shapeLabel,
} from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { getCigarBySlug } from '@/lib/referential/queries'
import {
  aromaLabels,
  getCigarStats,
  listReviewsForCigar,
  myScoreScale,
} from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { CommentThread } from './comment-thread'
import { RailSection } from './rail-section'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const copy = m.referential.cigar

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cigar = await getCigarBySlug(slug)
  if (!cigar) return { title: m.referential.cigarsTitle }

  const brand = cigar.brands?.name
  return { title: brand ? `${brand} ${cigar.commercial_name}` : cigar.commercial_name }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex flex-col gap-0.5 border-b py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/**
 * The cigar entry — rebuilt on 5 septembre 2026 from the design audit.
 *
 * Three zones for three questions, in the order a reader asks them:
 *
 *   1. **What is it** — the sheet: breadcrumb, the band (the card IS a band,
 *      §4.4), the name, then the three measures under their labels, the aroma
 *      profile, and what else the referential knows, two columns. A gap stays
 *      a cell and the cell is the wiki's door: 862 of the 940 published sheets
 *      have no vitola, and the previous page opened on "Vitole non renseignée"
 *      with the wiki button as its first call to action.
 *   2. **What do I do with it** — the rail, sticky on a desk: in the cave or
 *      not, the one gesture, my own entries. One form where there were three.
 *   3. **What do others say** — the weighted mean sized to its content, the
 *      most-cited aromas, the entries as rows, and the discussion of the sheet
 *      said for what it is.
 *
 * The grid puts the rail second in the DOM — between the sheet and the
 * community — so a phone reads sheet, then rail, then community, while a desk
 * shows the rail beside both. Two rows, two columns, no JavaScript.
 *
 * `?geste=fumer` opens the gesture; the sheet URL closes it. Interface state
 * lives in the URL (app/CLAUDE.md), which is what lets the open panel survive
 * the server re-render every write provokes.
 *
 * `notFound()` covers both "no such slug" and "exists but is still a draft":
 * the query filters on `status = 'published'`, so an unpublished entry is
 * indistinguishable from a missing one. That is deliberate — revealing that a
 * draft exists at a given slug would leak the referential's unreviewed contents
 * one 404 at a time.
 */
export default async function CigarPage({ params, searchParams }: Props) {
  const { slug } = await params
  const query = await searchParams
  const geste = Array.isArray(query.geste) ? query.geste[0] : query.geste
  const gestureOpen = geste === 'fumer'

  const cigar = await getCigarBySlug(slug)
  if (!cigar) notFound()

  const [user, stats, entries, profile] = await Promise.all([
    currentUser(),
    getCigarStats(cigar.id),
    /* Every entry this reader may see — four SELECT policies decide, nothing
       here restates them. The rail picks "mine" out of the same list. */
    listReviewsForCigar(cigar.id),
    aromaLabels(cigar.aroma_tags),
  ])
  const scale = user ? await myScoreScale(user.id) : 100

  const vitola = cigar.vitolas
  const brand = cigar.brands
  const propose = routes.cigarPropose(cigar.slug)
  const subline = [
    cigar.origin_country ? countryLabel(cigar.origin_country) : null,
    vitola?.name_salida ?? null,
    vitola ? shapeLabel(vitola.shape) : null,
    cigar.release_year ? `${copy.since} ${cigar.release_year}` : null,
  ].filter((part): part is string => part !== null)

  const entryCount =
    entries.length === 1
      ? m.cigarStats.entriesCountOne
      : m.cigarStats.entriesCount.replace('{count}', formatCount(entries.length))

  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 pb-28 lg:pb-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        {/* ---------------- 1 · the sheet ---------------- */}
        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <nav
            aria-label={copy.breadcrumb}
            className="text-ink-muted flex flex-wrap items-center gap-2 text-xs"
          >
            <Link href={routes.cigars()} className="hover:text-ink">
              {m.nav.cigars.label}
            </Link>
            {brand ? (
              <>
                <span aria-hidden="true" className="text-ink-faint">
                  ›
                </span>
                <Link href={routes.brand(brand.slug)} className="hover:text-ink">
                  {brand.name}
                </Link>
              </>
            ) : null}
            <span aria-hidden="true" className="text-ink-faint">
              ›
            </span>
            <span className="text-ink" aria-current="page">
              {cigar.commercial_name}
            </span>
          </nav>

          <Band brand={brand?.name} vitola={cigar.commercial_name} />

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display-md sm:text-display-lg">
              {cigar.commercial_name}
            </h1>
            {subline.length > 0 ? (
              <p className="text-ink-muted text-base">{subline.join(' · ')}</p>
            ) : null}
            {cigar.lines ? <p className="text-ink-muted text-sm">{cigar.lines.name}</p> : null}
          </div>

          <SpecStrip
            slug={cigar.slug}
            ringGauge={vitola?.ring_gauge ?? null}
            lengthMm={vitola?.length_mm ?? null}
            strength={(cigar.strength as Strength | null) ?? null}
            shade={(cigar.wrapper_shade as WrapperShade | null) ?? null}
          />

          {/* The aroma profile of the referential (migration 0025): what one
              finds from one box to the next. The members' most-cited aromas
              are a different fact and live with the notes, below. */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="eyebrow">{copy.aromas}</span>
              <span className="text-ink-faint text-xs">{copy.aromasLede}</span>
            </div>
            {cigar.aroma_tags.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {cigar.aroma_tags.map((id) => {
                  const label = profile.get(id)
                  if (!label) return null
                  return (
                    <li
                      key={id}
                      className="border-rule-strong text-ink rounded-[3px] border px-2 py-1 text-xs"
                    >
                      {label}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-ink-faint text-sm">
                {copy.notProvidedPl}
                {' · '}
                <Link
                  href={propose}
                  className="text-accent hover:text-accent-bright text-xs underline underline-offset-4"
                >
                  {copy.proposeAromas}
                </Link>
              </p>
            )}
          </div>

          <dl className="grid gap-x-10 sm:grid-cols-2">
            <Fact label={copy.salida}>
              {vitola ? (
                <Link
                  href={routes.vitola(vitola.slug)}
                  className="text-accent-bright hover:text-accent underline underline-offset-4"
                >
                  {vitola.name_salida}
                </Link>
              ) : (
                <span className="text-ink-faint">{copy.notProvidedF}</span>
              )}
            </Fact>
            <Fact label={copy.galera}>
              {vitola?.name_galera ?? <span className="text-ink-faint">{copy.notProvidedF}</span>}
            </Fact>
            <Fact label={copy.wrapperOrigin}>
              {cigar.wrapper_origin ? (
                countryLabel(cigar.wrapper_origin)
              ) : (
                <span className="text-ink-faint">{copy.notProvidedF}</span>
              )}
            </Fact>
            <Fact label={copy.binderOrigin}>
              {cigar.binder_origin ? (
                countryLabel(cigar.binder_origin)
              ) : (
                <span className="text-ink-faint">{copy.notProvidedF}</span>
              )}
            </Fact>
            <Fact label={copy.fillerOrigins}>
              {cigar.filler_origins.length > 0 ? (
                cigar.filler_origins.map((code) => countryLabel(code)).join(', ')
              ) : (
                <span className="text-ink-faint">{copy.notProvidedF}</span>
              )}
            </Fact>
            <Fact label={copy.release}>
              {releaseTypeLabel(cigar.release_type)}
              {cigar.release_year ? ` · ${cigar.release_year}` : null}
              {cigar.discontinued_year ? (
                <span className="text-ink-muted">
                  {' '}
                  {copy.discontinued.replace('{year}', String(cigar.discontinued_year))}
                </span>
              ) : null}
            </Fact>
            {/* The price and its effective date are one fact, never two. The
                table refuses a price without a source and a date; so does this
                page. */}
            {cigar.msrp_eur !== null && cigar.msrp_effective_on ? (
              <Fact label={copy.price}>
                <span className="font-mono">{formatPrice(cigar.msrp_eur)}</span>
                <span className="text-ink-muted">
                  {' '}
                  {copy.priceAt.replace('{date}', formatEffectiveDate(cigar.msrp_effective_on))}
                </span>
                <span className="text-ink-faint block text-xs">{copy.priceSource}</span>
              </Fact>
            ) : null}
            <Fact label={copy.line}>
              {cigar.lines?.name ?? <span className="text-ink-faint">{copy.notProvidedF}</span>}
            </Fact>
          </dl>

          {/* The wiki footer: provenance first, the doors after. A correction
              is proposed while looking at what is wrong; the history is where
              one checks whether somebody already noticed. */}
          <p className="text-ink-faint flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {cigar.verified_at ? (
              <span>
                {copy.publishedOn.replace('{date}', formatEffectiveDate(cigar.verified_at))}
              </span>
            ) : null}
            <Link href={propose} className="hover:text-ink underline underline-offset-4">
              {m.contributions.proposeLink}
            </Link>
            <Link
              href={routes.cigarHistory(cigar.slug)}
              className="hover:text-ink underline underline-offset-4"
            >
              {m.contributions.historyLink}
            </Link>
            <Link
              href={routes.cigarCompare()}
              className="hover:text-ink underline underline-offset-4"
            >
              {m.compare.title}
            </Link>
          </p>
        </div>

        {/* ---------------- 2 · you and this cigar ---------------- */}
        <aside className="self-start lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <RailSection
            cigar={{ id: cigar.id, slug: cigar.slug, commercial_name: cigar.commercial_name }}
            entries={entries}
            scale={scale}
            gestureOpen={gestureOpen}
          />
        </aside>

        {/* ---------------- 3 · what the members say ---------------- */}
        <div className="flex flex-col gap-10 lg:col-start-1 lg:row-start-2">
          <Band variant="divider">
            <span className="eyebrow">{copy.membersBand}</span>
          </Band>

          <StatsPanel stats={stats} scale={scale} />

          <section aria-labelledby="entrees" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="entrees" className="font-display text-display-sm">
                {m.cigarStats.entriesTitle}
              </h2>
              {entries.length > 0 ? <p className="text-ink-faint text-sm">{entryCount}</p> : null}
            </div>
            {entries.length === 0 ? (
              <p className="text-ink-faint text-sm">{m.cigarStats.entriesEmpty}</p>
            ) : (
              <div className="border-rule border-t">
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    scale={scale}
                    showAuthor
                    isMine={user?.id === entry.user_id}
                  />
                ))}
              </div>
            )}
          </section>

          <CommentThread cigarId={cigar.id} slug={cigar.slug} />
        </div>
      </div>
    </main>
  )
}
