/**
 * The note, read in bands out of five.
 *
 * QA of 12 septembre 2026: « système de notation on passe en bague et notation
 * sur 5 ». What changed is the SCALE THE READER SEES, and nothing else:
 * `reviews.score_total` is still stored out of a hundred, for the three
 * reasons migration 0028 sets out — the six sub-scores of a tasting average to
 * 78,3 and not to 4, the Bayesian prior of ADR 0004 is calibrated on a
 * hundred, and a column out of a hundred can render bands while a column out
 * of five can no longer render 78,3.
 *
 * So this file is the whole conversion, in one place, pure and tested. One
 * band is worth twenty points; the mapping back is the exact inverse, which is
 * what lets `cigar_stats.distribution` and the interface agree on which band a
 * score falls into.
 */

/** Five bands. Not a setting — the QA session named the number. */
export const RING_MAX = 5

/** What one band is worth on the stored scale. */
export const RING_POINTS = 100 / RING_MAX

/**
 * A stored score, as a number of bands — exact, with its decimals.
 *
 * 78,3 out of a hundred is 3,915 bands. Nothing rounds here: the reader sees a
 * rounded glyph and a rounded figure, and both round from this.
 */
export function ringsFromScore(scoreOutOf100: number): number {
  return scoreOutOf100 / RING_POINTS
}

/** A number of bands, as a stored score. Three bands are sixty points. */
export function scoreFromRings(rings: number): number {
  return rings * RING_POINTS
}

/**
 * Which of the five bands a score belongs to, as a whole number.
 *
 * The mirror of the `greatest(1, ceil(score / 20))` of migration 0028, and
 * `tests/unit/reviews-rings.test.ts` reads that migration and compares the two
 * arm by arm. A duplicated rule is a bug waiting unless something checks it —
 * the lesson `humidor/model.ts` paid for.
 */
export function ringBucket(scoreOutOf100: number): number {
  return Math.max(1, Math.min(RING_MAX, Math.ceil(scoreOutOf100 / RING_POINTS)))
}

/**
 * The bands, rounded to the nearest half — what a glyph can actually draw.
 *
 * Half a band is as fine as a row of five shapes goes: a third of a band is a
 * three-pixel sliver nobody reads, and it would promise a precision the
 * gesture does not have.
 */
export function ringsToHalves(scoreOutOf100: number): number {
  return Math.round(ringsFromScore(scoreOutOf100) * 2) / 2
}
