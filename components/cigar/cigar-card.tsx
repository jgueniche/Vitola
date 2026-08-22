import Link from 'next/link'

import { RingGauge } from '@/components/data/ring-gauge'
import { StrengthMeter } from '@/components/data/strength-meter'
import { WrapperScale, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel, formatEffectiveDate, formatPrice } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { CigarSummary } from '@/lib/search/query'
import type { Strength } from '@/components/data/strength-meter'

/**
 * One entry in the faceted result set.
 *
 * The whole card is a link, but only the title is the accessible name: the
 * dimensions and the price are decoration for a screen reader following the
 * list, and repeating them in the link label makes the list unreadable.
 */
export function CigarCard({ cigar }: { cigar: CigarSummary }) {
  const vitola = cigar.vitolas

  return (
    <article className="border-rule bg-surface hover:border-rule-strong rounded-[3px] border transition-colors">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          {cigar.brands ? <p className="eyebrow">{cigar.brands.name}</p> : null}
          <h2 className="font-display text-xl leading-tight">
            <Link href={routes.cigar(cigar.slug)} className="hover:text-accent-bright">
              {cigar.commercial_name}
            </Link>
          </h2>
          {vitola ? (
            <p className="text-ink-muted text-sm">{vitola.name_salida}</p>
          ) : (
            <p className="text-ink-faint text-sm">{m.referential.cigar.noVitola}</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {vitola ? (
            <RingGauge ringGauge={vitola.ring_gauge} lengthMm={vitola.length_mm} />
          ) : null}
          {cigar.strength ? (
            <StrengthMeter strength={cigar.strength as Strength} />
          ) : null}
          {cigar.wrapper_shade ? (
            <WrapperScale shade={cigar.wrapper_shade as WrapperShade} />
          ) : null}
        </div>

        <div className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {cigar.origin_country ? <span>{countryLabel(cigar.origin_country)}</span> : null}
          {cigar.release_year ? <span>{cigar.release_year}</span> : null}
          {/* A price is never shown without the date it takes effect: the decree
              is revised about monthly, and an undated price ages into a false one. */}
          {cigar.msrp_eur !== null && cigar.msrp_effective_on ? (
            <span className="font-mono">
              {formatPrice(cigar.msrp_eur)}
              <span className="text-ink-faint">
                {' · '}
                {formatEffectiveDate(cigar.msrp_effective_on)}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
