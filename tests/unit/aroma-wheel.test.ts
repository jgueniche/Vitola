import { describe, expect, it } from 'vitest'

import { labelAngle, pointOnCircle, ring, ringSegmentPath } from '@/lib/aromas/wheel'

/**
 * The geometry of the aroma wheel.
 *
 * Trigonometry is the kind of code that looks right and draws wrong, and an SVG
 * that draws wrong does not throw — it just renders something nobody can use.
 * Two failure modes in particular are silent and are pinned below: an unset
 * large-arc flag, which draws the *complement* of a segment and turns the wheel
 * inside out, and a full turn drawn as a single arc, which draws nothing at all
 * because its start and end points coincide.
 */

const near = (value: number, expected: number) => expect(value).toBeCloseTo(expected, 6)

describe('pointOnCircle', () => {
  it('puts zero degrees at twelve o’clock, which is how one reads a dial', () => {
    const top = pointOnCircle(0, 100)
    near(top.x, 0)
    near(top.y, -100)
  })

  it('turns clockwise', () => {
    const right = pointOnCircle(90, 100)
    near(right.x, 100)
    near(right.y, 0)

    const bottom = pointOnCircle(180, 100)
    near(bottom.x, 0)
    near(bottom.y, 100)
  })

  it('honours a centre that is not the origin', () => {
    const point = pointOnCircle(0, 10, { x: 5, y: 5 })
    near(point.x, 5)
    near(point.y, -5)
  })
})

describe('ringSegmentPath', () => {
  it('sets the large-arc flag past the half turn, and not before', () => {
    // Left at 0 on a wide segment, SVG draws the complement: the wheel renders
    // inside out and nothing errors.
    expect(ringSegmentPath(0, 90, 50, 100)).toContain('A 100 100 0 0 1')
    expect(ringSegmentPath(0, 200, 50, 100)).toContain('A 100 100 0 1 1')
  })

  it('draws a full turn as two half turns', () => {
    // One arc from a point back to itself draws nothing at all — which is what
    // a family with a single descriptor would ask for.
    const path = ringSegmentPath(0, 360, 50, 100)
    expect(path.match(/A 100 100/g)).toHaveLength(2)
    expect(path.match(/A 50 50/g)).toHaveLength(2)
  })

  it('closes the shape so it can be filled', () => {
    expect(ringSegmentPath(0, 45, 50, 100).endsWith('Z')).toBe(true)
  })
})

describe('ring', () => {
  it('divides the turn evenly and closes it exactly', () => {
    const sectors = ring(11, 50, 100)
    expect(sectors).toHaveLength(11)
    near(sectors[0]!.start, 0)
    near(sectors[10]!.end, 360)
  })

  it('takes the gap out of each segment rather than adding it between them', () => {
    // Added between, eleven families would overrun the circle by eleven gaps.
    const sectors = ring(11, 50, 100, 2)
    near(sectors[10]!.start + 360 / 11, 360)
    expect(sectors[0]!.end).toBeLessThan(360 / 11)
  })

  it('gives a lone descriptor the whole ring, with no gap to fall through', () => {
    const [only] = ring(1, 50, 100, 2)
    near(only!.start, 0)
    near(only!.end, 360)
  })

  it('returns nothing for an empty family instead of dividing by zero', () => {
    expect(ring(0, 50, 100)).toEqual([])
    expect(ring(-3, 50, 100)).toEqual([])
  })

  it('puts a label on the midline of its ring', () => {
    const [first] = ring(4, 50, 100)
    // First quarter, mid-angle 45°, at radius 75.
    near(first!.mid, 45)
    near(Math.hypot(first!.labelAt.x, first!.labelAt.y), 75)
  })
})

describe('labelAngle', () => {
  it('lays a label along the arc on the right of the wheel', () => {
    expect(labelAngle(90)).toBe(0)
  })

  it('flips it past the horizon rather than leaving it upside down', () => {
    expect(labelAngle(270)).toBe(360)
    expect(labelAngle(181)).toBe(271)
  })

  it('normalises an angle that has gone round', () => {
    expect(labelAngle(450)).toBe(0)
    expect(labelAngle(-270)).toBe(0)
  })
})
