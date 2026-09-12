import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { RING_MAX, ringsToHalves } from '@/lib/reviews/rings'
import { cn } from '@/lib/utils'

const copy = m.notebook.rings

/**
 * The note, as bands.
 *
 * A cigar band is the signature element of the design system (§4.4) and the
 * one object every smoker keeps before tasting anything. Using it as the unit
 * of the rating is the reason the QA session asked for it — « on passe en
 * bague » — and it is also why this is a drawing rather than a star from an
 * icon set: a star is what every other site scores with.
 *
 * Halves are drawn by CLIPPING a filled band over an outlined one, in a
 * `overflow-hidden` span of the right width. No `<clipPath>`, no gradient, no
 * generated id — which matters more than it sounds: an id inside a component
 * rendered five times on a page collides with itself, and the fix is always a
 * `useId` that turns a server component into a client one.
 *
 * One accessible name for the whole row, on the wrapper: five separate glyphs
 * each announcing themselves is five times the noise and no more information.
 * The figure is in the name because a screen reader cannot count shapes.
 */
export function RingRating({
  score,
  size = 'md',
  showValue = false,
  className,
}: {
  /** The stored score, out of a hundred. Null renders nothing. */
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  /** The figure beside the bands, for a page whose subject IS the number. */
  showValue?: boolean
  className?: string
}) {
  if (score === null) return null

  const halves = ringsToHalves(score)
  const label = copy.of
    .replace('{value}', formatRingValue(score))
    .replace('{max}', String(RING_MAX))

  const glyph = size === 'lg' ? 'h-4 w-5' : size === 'md' ? 'h-3 w-4' : 'h-2.5 w-3.5'
  const gap = size === 'lg' ? 'gap-1.5' : 'gap-1'

  return (
    <span className={cn('inline-flex items-center', showValue ? 'gap-2.5' : '', className)}>
      <span role="img" aria-label={label} className={cn('inline-flex items-center', gap)}>
        {Array.from({ length: RING_MAX }, (_, index) => {
          /* How much of THIS band is earned: all of it, half, or none. */
          const filled = Math.max(0, Math.min(1, halves - index))
          return (
            <span key={index} className={cn('relative inline-block', glyph)}>
              <BandGlyph className="text-rule-strong" />
              {filled > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${filled * 100}%` }}
                >
                  <BandGlyph className={cn('text-accent', glyph)} filled />
                </span>
              ) : null}
            </span>
          )
        })}
      </span>
      {showValue ? (
        <span
          className={cn(
            'font-medium tabular-nums',
            size === 'lg' ? 'text-[2rem] leading-none' : 'text-sm',
          )}
        >
          {formatRingValue(score)}
        </span>
      ) : null}
    </span>
  )
}

/**
 * One band, seen flat: the paper ring with its two crests.
 *
 * Drawn at 20 × 16 and scaled by its box, so the hairlines thin out with the
 * glyph instead of thickening. `currentColor` throughout, so the caller tints
 * it with a semantic token and nothing here names a colour.
 */
function BandGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 16"
      aria-hidden="true"
      focusable="false"
      className={cn('block h-full w-full', className)}
    >
      <rect
        x="1"
        y="1.5"
        width="18"
        height="13"
        rx="2.5"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.9 : 0}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* The two lines a band is printed with. Only on a filled one: on an
          empty glyph they close the shape up into a solid block. */}
      {filled ? (
        <>
          <path d="M1 5.5 H19" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" />
          <path d="M1 10.5 H19" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" />
        </>
      ) : null}
    </svg>
  )
}

/** One decimal, never rounded up to a flattering whole band. */
export function formatRingValue(scoreOutOf100: number): string {
  const rings = scoreOutOf100 / (100 / RING_MAX)
  return new Intl.NumberFormat(BRAND.locale, {
    minimumFractionDigits: Number.isInteger(rings) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(rings)
}
