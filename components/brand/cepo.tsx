import { initialPath, MARK_VIEWBOX, markCut, RING_RADIUS, ringStrokeWidth } from '@/lib/mark'
import { cn } from '@/lib/utils'

/**
 * <Cepo /> — the mark, in the interface.
 *
 * Decorative by construction: everywhere it appears the brand name is already
 * there as text, so the mark is `aria-hidden` and adds nothing to the
 * accessible name. A link wrapping both still reads as one word.
 *
 * The two colours arrive as classes rather than baked in, because the header
 * band does not flip with the theme and the page does: in a header the mark is
 * always on a dark ground (`stroke-header-accent`), in the page it follows the
 * theme (`stroke-accent`). Both are semantic tokens — a raw pigment here would
 * break the light theme in silence, which is the whole reason
 * tooling/scripts/check-tokens.ts refuses one.
 *
 * `size` is the ring's diameter D in pixels, and it is what chooses the cut.
 * See lib/mark.ts for why there are three.
 */
export function Cepo({
  size = 42,
  ring = 'stroke-accent',
  initial = 'fill-ink',
  className,
}: {
  size?: number
  /** Semantic stroke token for the ring, e.g. `stroke-header-accent`. */
  ring?: string
  /** Semantic fill token for the initial, e.g. `fill-header-ink`. */
  initial?: string
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <circle
        cx={MARK_VIEWBOX / 2}
        cy={MARK_VIEWBOX / 2}
        r={RING_RADIUS}
        stroke="currentColor"
        strokeWidth={ringStrokeWidth(size)}
        className={ring}
      />
      <path d={initialPath(markCut(size))} fill="currentColor" className={initial} />
    </svg>
  )
}
