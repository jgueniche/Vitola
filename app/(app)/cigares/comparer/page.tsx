import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { StrengthMeter, type Strength } from '@/components/data/strength-meter'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { countryLabel, formatEffectiveDate, formatPrice, shapeLabel } from '@/lib/cigar'
import { formatDimensions } from '@/lib/format'
import { m } from '@/lib/i18n'
import { getCigarBySlug, type CigarDetail } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'
import { EMPTY_FACETS } from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'

export const metadata: Metadata = { title: m.compare.title }

const copy = m.compare

const MAX = 4

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function many(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Le comparateur — F4, two to four sheets side by side.
 *
 * The whole state is the URL: `?c=slug&c=slug`. That is not a stylistic
 * preference here, it is the feature — a comparison one cannot send to somebody
 * is half a comparison, and the page says so at the bottom. Adding and removing
 * are links for the same reason, which also means the page needs no JavaScript
 * at all and no client component.
 *
 * Two decisions about what to show:
 *
 *   - **What is missing is drawn as missing**, with an em dash, rather than the
 *     row being hidden. 862 of the 940 seeded sheets have no vitola; a
 *     comparator that silently dropped the dimensions row would look like two
 *     cigars agreed about their size.
 *   - **The price is rendered exactly as the sheet renders it**, with its
 *     effective date and never without. The homologated price is revised about
 *     monthly; a figure without its date becomes misinformation within weeks.
 */
export default async function ComparePage({ searchParams }: Props) {
  const query = await searchParams

  /* De-duplicated, capped, order preserved: a repeated slug in a hand-edited
     URL should narrow the comparison, never error. */
  const slugs = [...new Set(many(query.c).filter(Boolean))].slice(0, MAX)
  const term = (one(query.q) ?? '').trim()

  const [cigars, found] = await Promise.all([
    Promise.all(slugs.map((slug) => getCigarBySlug(slug))),
    term ? searchCigars({ ...EMPTY_FACETS, query: term }) : Promise.resolve(null),
  ])

  const kept = cigars.filter((cigar): cigar is CigarDetail => cigar !== null)

  const withSlug = (next: string[], q?: string) => {
    const params = new URLSearchParams()
    for (const slug of next) params.append('c', slug)
    if (q) params.set('q', q)
    const qs = params.toString()
    return qs ? `${routes.cigarCompare()}?${qs}` : routes.cigarCompare()
  }

  const rows: { label: string; value: (cigar: CigarDetail) => string | null }[] = [
    { label: copy.rowBrand, value: (c) => c.brands?.name ?? null },
    { label: copy.rowOrigin, value: (c) => (c.origin_country ? countryLabel(c.origin_country) : null) },
    { label: copy.rowVitola, value: (c) => c.vitolas?.name_salida ?? null },
    {
      label: copy.rowDimensions,
      value: (c) =>
        c.vitolas ? formatDimensions(c.vitolas.ring_gauge, c.vitolas.length_mm) : null,
    },
    { label: copy.rowShape, value: (c) => (c.vitolas ? shapeLabel(c.vitolas.shape) : null) },
    { label: copy.rowWrapperOrigin, value: (c) => (c.wrapper_origin ? countryLabel(c.wrapper_origin) : null) },
    { label: copy.rowBinderOrigin, value: (c) => (c.binder_origin ? countryLabel(c.binder_origin) : null) },
    {
      label: copy.rowFillerOrigins,
      value: (c) =>
        c.filler_origins.length > 0 ? c.filler_origins.map(countryLabel).join(', ') : null,
    },
    { label: copy.rowRelease, value: (c) => (c.release_year ? String(c.release_year) : null) },
    {
      /*
       * The price behaves exactly as it does on the sheet: shown with its
       * effective date, or not at all. `feature_flags.show_indicative_prices`
       * is off and **nothing reads it** — not here and not on the sheet — which
       * is worth knowing and is not this page's to decide: wiring it would hide
       * the price on 900 sheets, and that is a product call tied to Q19.
       * Deciding it differently here would be worse than either answer, because
       * two pages would then disagree about the same fact.
       */
      label: copy.rowPrice,
      value: (c) =>
        c.msrp_eur !== null && c.msrp_effective_on
          ? `${formatPrice(c.msrp_eur)} · ${formatEffectiveDate(c.msrp_effective_on)}`
          : null,
    },
  ]
  /*
   * There is no "relue le" row, and its absence is the decision.
   *
   * `ref.cigars.verified_at` is set on all 940 sheets and `verified_by` is NULL
   * on all 940 — measured, not assumed. The timestamp was written by the
   * publication, not by anybody reading anything, and `PROVENANCE.md` says 862
   * of those sheets have never been read at all.
   *
   * No screen renders that column today. This one would have been the first,
   * and it would have told every reader "Relue le 22 août 2026" about a review
   * that did not happen — the exact claim a referential must not make. The
   * column is left alone (unpublishing is the owner's call, and
   * `supabase/scripts/unpublish.sql` is the tool for it); what is refused here
   * is repeating it.
   */

  return (
    <main id="contenu" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {kept.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Link href={routes.cigars()}>
              <Button variant="secondary" size="sm">
                {m.humidor.searchBrowse}
              </Button>
            </Link>
          }
        />
      ) : (
        <section className="flex flex-col gap-4">
          {kept.length === 1 ? (
            <p className="text-ink-muted measure text-sm leading-relaxed">{copy.needTwo}</p>
          ) : null}

          {/* Wide content scrolls inside its own container, never the page. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-rule w-40 border-b py-2 text-left align-bottom">
                    <span className="sr-only">{copy.rowBrand}</span>
                  </th>
                  {kept.map((cigar) => (
                    <th
                      key={cigar.slug}
                      className="border-rule border-b px-3 py-2 text-left align-bottom font-normal"
                    >
                      <span className="flex flex-col gap-1">
                        <Link
                          href={routes.cigar(cigar.slug)}
                          className="font-display hover:text-accent-bright text-lg leading-tight"
                        >
                          {cigar.commercial_name}
                        </Link>
                        <Link
                          href={withSlug(
                            kept.filter((other) => other.slug !== cigar.slug).map((o) => o.slug),
                            term || undefined,
                          )}
                          className="text-ink-faint hover:text-ink text-xs underline"
                        >
                          {copy.remove}
                        </Link>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="border-rule text-ink-muted border-b py-2 text-left align-top font-normal"
                    >
                      <span className="eyebrow">{row.label}</span>
                    </th>
                    {kept.map((cigar) => (
                      <td
                        key={cigar.slug}
                        className="border-rule border-b px-3 py-2 align-top"
                      >
                        {row.value(cigar) ?? (
                          <span className="text-ink-faint">{copy.missing}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Strength is a meter rather than a word, because that is what
                    it is on the sheet and a comparator that renders the same
                    fact differently makes the reader do the translating. */}
                <tr>
                  <th
                    scope="row"
                    className="border-rule text-ink-muted border-b py-2 text-left align-top font-normal"
                  >
                    <span className="eyebrow">{copy.rowStrength}</span>
                  </th>
                  {kept.map((cigar) => (
                    <td key={cigar.slug} className="border-rule border-b px-3 py-2 align-top">
                      {cigar.strength ? (
                        <StrengthMeter strength={cigar.strength as Strength} />
                      ) : (
                        <span className="text-ink-faint">{copy.missing}</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-ink-faint text-xs">{copy.shareHint}</p>
        </section>
      )}

      <section className="border-rule flex flex-col gap-4 border-t pt-8">
        <h2 className="font-display text-2xl">{copy.searchLabel}</h2>

        {kept.length >= MAX ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.full}</p>
        ) : (
          <>
            <form method="get" className="flex flex-wrap items-end gap-3">
              {slugs.map((slug) => (
                <input key={slug} type="hidden" name="c" value={slug} />
              ))}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="compare-q">{copy.searchLabel}</Label>
                <Input
                  id="compare-q"
                  name="q"
                  defaultValue={term}
                  placeholder={copy.searchPlaceholder}
                  className="w-64"
                />
              </div>
              <Button type="submit" variant="secondary">
                {copy.searchAction}
              </Button>
            </form>

            {found && found.cigars.length === 0 ? (
              <p className="text-ink-muted text-sm">{copy.searchNoResult}</p>
            ) : null}

            {found && found.cigars.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {found.cigars
                  .filter((cigar) => !slugs.includes(cigar.slug))
                  .slice(0, 8)
                  .map((cigar) => (
                    <li
                      key={cigar.id}
                      className="border-rule bg-surface flex items-center justify-between gap-3 rounded-[3px] border px-4 py-2"
                    >
                      <span className="text-sm">
                        {cigar.commercial_name}
                        {cigar.brands?.name ? (
                          <span className="text-ink-muted"> · {cigar.brands.name}</span>
                        ) : null}
                      </span>
                      <Link href={withSlug([...slugs, cigar.slug], term || undefined)}>
                        <Button variant="secondary" size="sm">
                          {copy.add}
                        </Button>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
    </main>
  )
}
