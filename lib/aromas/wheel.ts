/**
 * The geometry of the aroma wheel (§5.4), as arithmetic.
 *
 * The wheel is a *saisie* control — the §5.4 circular form belongs to the input,
 * not to the reference page at `/aromes`, which is a list because a list is what
 * one reads. Here one points at a thing, and pointing wants a shape.
 *
 * Kept in `lib/` and free of React so the trigonometry can be checked by a test
 * rather than by looking at it. Every angle in this file is measured in degrees
 * clockwise from twelve o'clock, which is how one reads a dial and not how
 * `Math.cos` works — `pointOnCircle` is the only place that conversion happens.
 */

export type Point = { x: number; y: number }

export type Sector = {
  /** Inclusive start angle, degrees clockwise from twelve o'clock. */
  start: number
  /** Exclusive end angle. */
  end: number
  /** The angle a label sits on. */
  mid: number
  /** SVG path of the ring segment between the two radii. */
  path: string
  /** Where a label goes, on the mid-angle at the ring's midline. */
  labelAt: Point
  /**
   * Degrees to rotate a label so it reads along the arc without ever standing
   * on its head: past the horizon it is flipped rather than left upside down.
   */
  labelRotation: number
}

const CENTRE = { x: 0, y: 0 }

/** Twelve o'clock is -90° in screen coordinates, and y grows downwards. */
export function pointOnCircle(angleDegrees: number, radius: number, centre: Point = CENTRE): Point {
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return {
    x: centre.x + radius * Math.cos(radians),
    y: centre.y + radius * Math.sin(radians),
  }
}

/**
 * One ring segment, as a closed SVG path: outer arc, straight in, inner arc
 * back, close.
 *
 * The `large-arc-flag` is the detail worth stating. It must be set once a
 * segment spans more than half the circle, which happens for real: a family
 * with a single descriptor gives that descriptor the whole ring. Left at 0, the
 * path silently draws the *complement* — the wheel appears inside out, and
 * nothing errors.
 */
export function ringSegmentPath(
  startAngle: number,
  endAngle: number,
  innerRadius: number,
  outerRadius: number,
  centre: Point = CENTRE,
): string {
  const sweep = endAngle - startAngle

  /*
   * A full turn cannot be drawn as one arc — start and end coincide, and the
   * renderer draws nothing at all. Two half-turns make an annulus.
   */
  if (sweep >= 360) {
    const o = outerRadius
    const i = innerRadius
    return [
      `M ${centre.x} ${centre.y - o}`,
      `A ${o} ${o} 0 1 1 ${centre.x} ${centre.y + o}`,
      `A ${o} ${o} 0 1 1 ${centre.x} ${centre.y - o}`,
      `M ${centre.x} ${centre.y - i}`,
      `A ${i} ${i} 0 1 0 ${centre.x} ${centre.y + i}`,
      `A ${i} ${i} 0 1 0 ${centre.x} ${centre.y - i}`,
      'Z',
    ].join(' ')
  }

  const largeArc = sweep > 180 ? 1 : 0
  const outerStart = pointOnCircle(startAngle, outerRadius, centre)
  const outerEnd = pointOnCircle(endAngle, outerRadius, centre)
  const innerEnd = pointOnCircle(endAngle, innerRadius, centre)
  const innerStart = pointOnCircle(startAngle, innerRadius, centre)

  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    'Z',
  ].join(' ')
}

/**
 * Divides a full turn into `count` equal ring segments.
 *
 * `gapDegrees` is taken out of each segment rather than added between them, so
 * the ring still closes exactly at 360° whatever the count. Adding it would
 * make eleven families overrun the circle by eleven gaps.
 */
export function ring(
  count: number,
  innerRadius: number,
  outerRadius: number,
  gapDegrees = 0,
  centre: Point = CENTRE,
): Sector[] {
  if (count <= 0) return []

  const step = 360 / count
  const gap = count === 1 ? 0 : Math.min(gapDegrees, step / 4)
  const labelRadius = (innerRadius + outerRadius) / 2

  return Array.from({ length: count }, (_unused, index) => {
    const start = index * step
    const end = start + step - gap
    const mid = (start + end) / 2

    return {
      start,
      end,
      mid,
      path: ringSegmentPath(start, end, innerRadius, outerRadius, centre),
      labelAt: pointOnCircle(mid, labelRadius, centre),
      labelRotation: labelAngle(mid),
    }
  })
}

/**
 * The rotation that keeps a label readable on its segment.
 *
 * A label laid along the arc reads outwards on the right of the wheel and
 * upside down on the left. Past the horizon it is turned a further half-turn,
 * which reads inwards — legible either way, which upside down is not.
 */
export function labelAngle(midAngle: number): number {
  const normalised = ((midAngle % 360) + 360) % 360
  return normalised > 180 ? normalised + 90 : normalised - 90
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
