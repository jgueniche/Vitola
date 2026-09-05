import Link from 'next/link'

import { Band } from '@/components/band/band'
import { StrengthMeter, strengthLabel, type Strength } from '@/components/data/strength-meter'
import { WrapperScale, shadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel, formatEffectiveDate, formatPrice } from '@/lib/cigar'
import { formatDimensions } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { CigarSummary } from '@/lib/search/query'

const copy = m.referential

/**
 * One entry in the faceted result set — a band, as §4.4 always meant it: the
 * card is topped by the brass lockup of brand and name, and the three measures
 * sit under their labels the way the sheet shows them.
 *
 * A sparse sheet says so. 862 of the 940 published sheets have no vitola, and
 * the old card simply rendered nothing where the gauges should be — a grid of
 * near-empty boxes that read as a broken page. "Non renseignés" plus the
 * door of the wiki turns the gap into the invitation §4.6 asks for.
 *
 * The whole card is a link, but only the title is the accessible name: the
 * dimensions and the price are decoration for a screen reader following the
 * list, and repeating them in the link label makes the list unreadable.
 */
export function CigarCard({ cigar }: { cigar: CigarSummary }) {
  const vitola = cigar.vitolas
  const strength = (cigar.strength as Strength | null) ?? null
  const shade = (cigar.wrapper_shade as WrapperShade | null) ?? null
  const sparse = !vitola && !strength && !shade

  const meta = [
    vitola?.name_salida ?? null,
    cigar.origin_country ? countryLabel(cigar.origin_country) : null,
    cigar.release_year ? String(cigar.release_year) : null,
  ].filter((part): part is string => part !== null)

  return (
    <article className="border-rule bg-surface hover:border-rule-strong flex h-full flex-col rounded-[3px] border transition-colors">
      <Band brand={cigar.brands?.name} vitola={cigar.commercial_name} />

      <div className="flex flex-1 flex-col gap-3.5 px-5 pt-4 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-base leading-tight font-medium">
            <Link href={routes.cigar(cigar.slug)} className="hover:text-accent-bright">
              {cigar.commercial_name}
            </Link>
          </h2>
          {meta.length > 0 ? <p className="text-ink-muted text-xs">{meta.join(' · ')}</p> : null}
        </div>

        {sparse ? (
          <div className="border-rule-strong flex flex-col gap-1 rounded-[3px] border border-dashed px-3 py-2.5">
            <p className="text-ink-faint text-sm">{copy.card.sparse}</p>
            <Link
              href={routes.cigarPropose(cigar.slug)}
              className="text-accent hover:text-accent-bright w-fit text-xs underline underline-offset-4"
            >
              {copy.card.proposeValues}
            </Link>
          </div>
        ) : (
          <dl className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <dt className="eyebrow text-[0.625rem]">{copy.cigar.cepoLength}</dt>
              <dd className="font-mono text-sm tracking-wide">
                {vitola ? (
                  formatDimensions(vitola.ring_gauge, vitola.length_mm)
                ) : (
                  <span className="text-ink-faint font-sans">{copy.cigar.notProvided}</span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow text-[0.625rem]">{copy.cigar.strength}</dt>
              {strength ? (
                <>
                  <dd className="text-sm">{strengthLabel(strength)}</dd>
                  <dd>
                    <StrengthMeter strength={strength} showLabel={false} />
                  </dd>
                </>
              ) : (
                <dd className="text-ink-faint text-sm">{copy.cigar.notProvidedF}</dd>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <dt className="eyebrow text-[0.625rem]">{copy.cigar.wrapper}</dt>
              {shade ? (
                <>
                  <dd className="text-sm">{shadeLabel(shade)}</dd>
                  <dd>
                    <WrapperScale shade={shade} showLabel={false} />
                  </dd>
                </>
              ) : (
                <dd className="text-ink-faint text-sm">{copy.cigar.notProvidedF}</dd>
              )}
            </div>
          </dl>
        )}

        {/* A price is never shown without the date it takes effect: the decree
            is revised about monthly, and an undated price ages into a false one. */}
        {cigar.msrp_eur !== null && cigar.msrp_effective_on ? (
          <p className="border-rule text-ink-muted mt-auto border-t pt-2.5 font-mono text-xs">
            {formatPrice(cigar.msrp_eur)}
            <span className="text-ink-faint">
              {' · '}
              {formatEffectiveDate(cigar.msrp_effective_on)}
            </span>
          </p>
        ) : null}
      </div>
    </article>
  )
}
