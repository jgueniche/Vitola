import Link from 'next/link'

import {
  StrengthMeter,
  STRENGTHS,
  strengthLabel,
  type Strength,
} from '@/components/data/strength-meter'
import {
  WrapperScale,
  WRAPPER_SHADES,
  shadeLabel,
  type WrapperShade,
} from '@/components/data/wrapper-scale'
import { formatDimensions } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

const copy = m.referential.cigar

/**
 * The three measures a sheet is read by — cepo × longueur, force, cape — each
 * under its own label, with the gauge beneath the value.
 *
 * The design audit of 5 septembre 2026 found the gauges rendered without a
 * word: "50 × 124 mm", five bars, six dots, and nothing saying cepo, force or
 * cape. It also found the silhouette drawn inside the width of its own label,
 * about 100px, so it showed nothing. Here the silhouette is drawn to scale on
 * a 235mm reference — the longest vitola of the referential — in a 200px box.
 *
 * A missing value stays a cell, and the cell is the door of the wiki: 862 of
 * the 940 published sheets have no vitola, and §4.6 says an empty state is an
 * invitation. The link opens the proposal form on the sheet; the form itself
 * decides who may propose (a signed-in member, when contributions are open).
 */
export function SpecStrip({
  slug,
  ringGauge,
  lengthMm,
  strength,
  shade,
}: {
  slug: string
  ringGauge: number | null
  lengthMm: number | null
  strength: Strength | null
  shade: WrapperShade | null
}) {
  const propose = routes.cigarPropose(slug)

  return (
    <dl className="border-rule grid border-t border-b sm:grid-cols-3">
      <div className="border-rule flex flex-col gap-2.5 border-b py-4 sm:border-r sm:border-b-0 sm:pr-5">
        <dt className="eyebrow">{copy.cepoLength}</dt>
        {ringGauge !== null && lengthMm !== null ? (
          <>
            <dd className="font-mono text-xl leading-6 tracking-wide">
              {formatDimensions(ringGauge, lengthMm)}
            </dd>
            <dd>
              <Silhouette ringGauge={ringGauge} lengthMm={lengthMm} />
            </dd>
            <dd className="text-ink-faint text-xs">{copy.silhouetteNote}</dd>
          </>
        ) : (
          <Missing label={copy.notProvided} action={copy.proposeFormat} href={propose} />
        )}
      </div>

      <div className="border-rule flex flex-col gap-2.5 border-b py-4 sm:border-r sm:border-b-0 sm:px-5">
        <dt className="eyebrow">{copy.strength}</dt>
        {strength ? (
          <>
            <dd className="text-xl leading-6">{strengthLabel(strength)}</dd>
            <dd>
              <StrengthMeter strength={strength} showLabel={false} size="lg" />
            </dd>
            <dd className="text-ink-faint text-xs">
              {copy.strengthStep.replace('{n}', String(STRENGTHS.indexOf(strength) + 1))}
            </dd>
          </>
        ) : (
          <Missing label={copy.notProvidedF} action={copy.proposeStrength} href={propose} />
        )}
      </div>

      <div className="flex flex-col gap-2.5 py-4 sm:pl-5">
        <dt className="eyebrow">{copy.wrapper}</dt>
        {shade ? (
          <>
            <dd className="text-xl leading-6">{shadeLabel(shade)}</dd>
            <dd>
              <WrapperScale shade={shade} showLabel={false} size="lg" />
            </dd>
            <dd className="text-ink-faint text-xs">
              {copy.shadeStep.replace('{n}', String(WRAPPER_SHADES.indexOf(shade) + 1))}
            </dd>
          </>
        ) : (
          <Missing label={copy.notProvidedF} action={copy.proposeShade} href={propose} />
        )}
      </div>
    </dl>
  )
}

/** The gap said as a gap, and the way to close it. */
function Missing({ label, action, href }: { label: string; action: string; href: string }) {
  return (
    <>
      <dd className="text-ink-faint text-xl leading-6">{label}</dd>
      <dd>
        <Link
          href={href}
          className="text-accent hover:text-accent-bright text-xs underline underline-offset-4"
        >
          {action}
        </Link>
      </dd>
    </>
  )
}

/**
 * The cigar to scale: a 235mm reference line (the Gran Corona, the longest
 * vitola of the referential) in a 200px box, the body's length and diameter
 * both proportional. Ring gauge is in 64ths of an inch; the height is the
 * diameter at the same scale, so a 38 and a 56 read as what they are.
 */
function Silhouette({ ringGauge, lengthMm }: { ringGauge: number; lengthMm: number }) {
  const scale = 200 / 235
  const length = Math.min(200, Math.round(lengthMm * scale))
  const diameterMm = (ringGauge / 64) * 25.4
  const height = Math.max(4, Math.min(22, Math.round(diameterMm * scale)))
  const y = 24 - 2 - height
  const bandX = Math.round(length * 0.78)

  return (
    <svg width="200" height="26" viewBox="0 0 200 26" aria-hidden="true" className="block">
      <line x1="0" y1="25" x2="200" y2="25" className="stroke-rule-strong" strokeWidth="1" />
      <line x1="200" y1="20" x2="200" y2="25" className="stroke-rule-strong" strokeWidth="1" />
      <rect x="0" y={y} width={length} height={height} rx={height / 2} className="fill-ink-faint" />
      <rect x={bandX} y={y} width="5" height={height} className="fill-accent" />
    </svg>
  )
}
