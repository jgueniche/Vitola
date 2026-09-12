import Link from 'next/link'

import { Band } from '@/components/band/band'
import { RingRating } from '@/components/data/ring-rating'
import { StrengthMeter, strengthLabel, type Strength } from '@/components/data/strength-meter'
import { WrapperScale, shadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel, formatEffectiveDate, formatPrice } from '@/lib/cigar'
import { formatDimensions } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { CigarSummary } from '@/lib/search/query'

const copy = m.referential

/**
 * One entry in the faceted result set — a band, as §4.4 always meant it.
 *
 * Four things changed in the QA session of 12 septembre 2026, and each was a
 * one-line complaint about something that had been true for a week.
 *
 * 1. « Cliquez partout sur la carte pour rentrer. » The old card said in its
 *    own comment that the whole thing was a link; only the title was. It is
 *    now the stretched-link pattern — the title's `<Link>` grows an absolutely
 *    positioned `::after` over a `relative` card — so the click target is the
 *    card and the accessible name is still the title alone. Wrapping the card
 *    in the link instead would put the dimensions and the price in the link
 *    label, which makes a list of twenty-four unreadable to a screen reader.
 *
 * 2. « Il y a deux fois écrit le nom. » The band carried « BRAND · NAME » and
 *    the heading under it carried NAME again. The band now carries the brand,
 *    which is what a band is for.
 *
 * 3. « Quand il n'y a pas d'info sur la carte d'un cigare, ne mets pas non
 *    renseigné — on ne garde les infos pas remplies que pour les admins. »
 *    `showGaps` is read once by the page from the reader's role, never here: a
 *    card does not decide who sees what. A member sees the measures that
 *    exist and nothing where they do not; a reviewer sees the holes, because
 *    the holes are their work queue.
 *
 * 4. « L'enchaînement des cartes est pas bonne / pas assez épuré. » The three
 *    labelled gauges became one line of measures, and the members' note — the
 *    thing a reader is actually shopping for — took the space they left.
 */
export function CigarCard({
  cigar,
  showGaps = false,
}: {
  cigar: CigarSummary
  /**
   * Whether to name what the sheet is missing. False for everyone but a
   * reviewer: an empty field is a task, not information.
   */
  showGaps?: boolean
}) {
  const vitola = cigar.vitolas
  const strength = (cigar.strength as Strength | null) ?? null
  const shade = (cigar.wrapper_shade as WrapperShade | null) ?? null
  const bare = !vitola && !strength && !shade

  const meta = [
    vitola?.name_salida ?? null,
    cigar.origin_country ? countryLabel(cigar.origin_country) : null,
    cigar.release_year ? String(cigar.release_year) : null,
  ].filter((part): part is string => part !== null)

  return (
    <article className="border-rule bg-surface hover:border-rule-strong rounded-band relative flex h-full flex-col border transition-colors">
      {/* The band carries the maison. The name is the heading below it, once. */}
      <Band brand={cigar.brands?.name} />

      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <h2 className="text-base leading-tight font-medium">
          <Link
            href={routes.cigar(cigar.slug)}
            className="hover:text-accent-bright after:absolute after:inset-0 after:content-['']"
          >
            {cigar.commercial_name}
          </Link>
        </h2>

        {meta.length > 0 ? (
          <p className="text-ink-muted text-xs">{meta.join(' · ')}</p>
        ) : showGaps ? (
          <p className="text-ink-faint text-xs">{copy.card.sparse}</p>
        ) : null}

        {/* The measures, on one line, and only the ones that exist. Each is a
            figure with its unit; no label, because a cepo × length and a
            wrapper shade do not need one next to a cigar's name. */}
        {bare ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {vitola ? (
              <span className="font-mono tracking-wide">
                {formatDimensions(vitola.ring_gauge, vitola.length_mm)}
              </span>
            ) : null}
            {strength ? (
              <span className="text-ink-muted inline-flex items-center gap-1.5">
                <StrengthMeter strength={strength} showLabel={false} />
                {strengthLabel(strength)}
              </span>
            ) : null}
            {shade ? (
              <span className="text-ink-muted inline-flex items-center gap-1.5">
                <WrapperScale shade={shade} showLabel={false} />
                {shadeLabel(shade)}
              </span>
            ) : null}
          </div>
        )}

        <div className="border-rule mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2.5">
          {/* The members' note, when there is one. Silence otherwise: 937 of
              940 sheets have none, and « aucune note » on every card was the
              loudest thing in the grid. */}
          {cigar.bayesian_score !== null ? (
            <RingRating score={cigar.bayesian_score} size="sm" />
          ) : (
            <span />
          )}

          {/* A price is never shown without the date it takes effect: the
              decree is revised about monthly, and an undated price ages into a
              false one. */}
          {cigar.msrp_eur !== null && cigar.msrp_effective_on ? (
            <p className="text-ink-muted font-mono text-xs">
              {formatPrice(cigar.msrp_eur)}
              <span className="text-ink-faint">
                {' · '}
                {formatEffectiveDate(cigar.msrp_effective_on)}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}
