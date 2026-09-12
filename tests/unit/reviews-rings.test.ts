import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  RING_MAX,
  RING_POINTS,
  ringBucket,
  ringsFromScore,
  ringsToHalves,
  scoreFromRings,
} from '@/lib/reviews/rings'

/**
 * The band scale, checked against the SQL that counts in it.
 *
 * `ringBucket()` duplicates a rule migration 0028 already writes — the
 * `greatest(1, ceil(score / 20))` of `cigar_stats.distribution`. That is the
 * second duplicated rule in the repo after `humidor/model.ts`, and it is
 * justified by the same thing: the histogram and the glyph beside it must agree
 * about which band a note falls into, and the interface cannot ask the view.
 *
 * A duplicated rule is a bug waiting unless something reads both. This does.
 */
const MIGRATION_0028 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0028_notation_en_bagues.sql'),
  'utf8',
)

describe('the band scale', () => {
  it('is five bands worth twenty points each', () => {
    expect(RING_MAX).toBe(5)
    expect(RING_POINTS).toBe(20)
  })

  it('converts both ways without drift', () => {
    expect(ringsFromScore(60)).toBe(3)
    expect(scoreFromRings(3)).toBe(60)
    expect(scoreFromRings(ringsFromScore(78.3))).toBeCloseTo(78.3, 10)
  })

  it('keeps the decimals a tasting produces', () => {
    // The six sub-scores of §5.4 average to 78,3 out of a hundred, which is
    // 3,915 bands. Rounding on the way in is what migration 0028 refuses.
    expect(ringsFromScore(78.3)).toBeCloseTo(3.915, 10)
  })

  it('draws to the nearest half band and no finer', () => {
    expect(ringsToHalves(78.3)).toBe(4)
    expect(ringsToHalves(70)).toBe(3.5)
    expect(ringsToHalves(65)).toBe(3.5)
    expect(ringsToHalves(0)).toBe(0)
    expect(ringsToHalves(100)).toBe(5)
  })
})

describe('the bucket agrees with migration 0028', () => {
  it('still finds the SQL expression it mirrors', () => {
    // Guards the guard: a regex that stopped matching would leave the
    // assertions below comparing TypeScript against TypeScript.
    expect(MIGRATION_0028).toContain('greatest(1, ceil(e.score_total / 20.0))')
  })

  it('names the same five keys the view builds', () => {
    for (const key of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      expect(MIGRATION_0028).toContain(`'${key}',`)
    }
  })

  /*
   * The SQL is `greatest(1, ceil(score / 20))`, so the boundaries belong to the
   * band BELOW: exactly 60 is three bands, 60,1 is four. Walking them one by
   * one is the only way to catch an off-by-one that a round number hides.
   */
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [20.1, 2],
    [40, 2],
    [40.1, 3],
    [60, 3],
    [78.3, 4],
    [80, 4],
    [80.1, 5],
    [100, 5],
  ])('a note of %s falls in band %i', (score, band) => {
    expect(ringBucket(score)).toBe(band)
  })

  it('never leaves the scale, whatever it is handed', () => {
    expect(ringBucket(-5)).toBe(1)
    expect(ringBucket(1000)).toBe(RING_MAX)
  })
})
