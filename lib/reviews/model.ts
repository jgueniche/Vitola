/**
 * The notebook, as rules rather than as queries (ADR 0004).
 *
 * Everything here is pure: the scope vocabulary, the bounds migration 0003
 * writes as CHECK constraints, and the arithmetic that turns six sub-scores into
 * one. It is the half of the feature a test can hold without a database, which
 * is the whole reason `lib/` exists.
 *
 * One thing this file deliberately does NOT contain: any notion of *who may
 * read* an entry. The scopes below name audiences so the interface can describe
 * them; the RLS applies them, and nothing in TypeScript may re-decide. ADR 0004
 * is explicit that a query filtering `visibility` is a bug even when it is
 * right, because it outlives the policy it doubles.
 */

import type { Database } from '@/lib/supabase/database.types'

export type ReviewKind = Database['public']['Enums']['review_kind']
export type ReviewVisibility = Database['public']['Enums']['review_visibility']

/* -------------------------------------------------------------------------- */
/* Scopes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The four scopes, in widening order — which is also the order they are offered
 * in, so that reading down the list is reading outwards from oneself.
 *
 * `private` first is not presentation: it is the column default, and ADR 0004
 * ties that default to art. 25 (data minimisation) on a table the brief's §2
 * says may hold art. 9 data. Publishing is a gesture one makes, never one one
 * forgets to undo.
 */
export const REVIEW_SCOPES = ['private', 'shared', 'followers', 'public'] as const

export const DEFAULT_SCOPE: ReviewVisibility = 'private'

/**
 * What each scope actually does *today*, as opposed to what it names.
 *
 * The flags exist because two of the four scopes lie if you only read their
 * label, and the interface is what has to stop them lying:
 *
 *   - `namesPeople` — `shared` is the only scope whose audience is a list the
 *     author writes. It needs a second control; the others do not.
 *   - `livingAudience` — the ADR 0004 arbitration rendered executable:
 *     `followers` is the one scope whose readership grows *after* the author
 *     chose it. "Il écrit pour ses 12 abonnés du jour ; ils sont 300 six mois
 *     plus tard, et rien ne le lui a redemandé." The 22 August ruling kept the
 *     scope and turned the warning into an interface obligation — this flag is
 *     where that obligation is stored, so a component cannot render the option
 *     without it.
 *
 * A third flag lived here until P3 and is worth knowing about, because its
 * absence is the debt closing rather than a simplification.
 * `reachesNobodyYet` marked `followers` as having no readers at all: the SELECT
 * branch could not exist while `public.follows` did not, so an entry scoped to
 * one's followers was visible to its author and no one else, and the interface
 * said so. Migration 0010 writes that branch (ADR 0007, D1), so the flag, the
 * sentence it rendered and the message key behind it all went in the same
 * commit — an interface that keeps warning about a limit that has been lifted
 * is a worse lie than the one the warning existed to prevent.
 */
export type ScopeTraits = {
  namesPeople: boolean
  livingAudience: boolean
}

export const SCOPE_TRAITS: Record<ReviewVisibility, ScopeTraits> = {
  private: { namesPeople: false, livingAudience: false },
  shared: { namesPeople: true, livingAudience: false },
  followers: { namesPeople: false, livingAudience: true },
  public: { namesPeople: false, livingAudience: false },
}

/** Only a public entry feeds `cigar_stats` — ADR 0004, D3. */
export function countsTowardsPublicAverage(visibility: ReviewVisibility): boolean {
  return visibility === 'public'
}

/**
 * Whether a change of scope can move the public average, and therefore whether
 * the write that made it must refresh the materialized view.
 *
 * Both sides matter, which is the reason this is a function and not an `===`:
 * un-publishing an entry changes the average exactly as much as publishing one,
 * and a refresh skipped on the way out leaves a withdrawn note still counted.
 */
export function affectsPublicAverage(
  before: ReviewVisibility | null,
  after: ReviewVisibility | null,
): boolean {
  return countsTowardsPublicAverage(before ?? 'private') || countsTowardsPublicAverage(after ?? 'private')
}

/* -------------------------------------------------------------------------- */
/* Bounds — the mirror of migration 0003                                      */
/* -------------------------------------------------------------------------- */

/**
 * The constraints of `public.reviews`, restated for the forms.
 *
 * This IS duplication, and unlike a visibility filter it is the right kind: a
 * CHECK refuses in `23514`, which is not a sentence anyone should read. What is
 * duplicated is a *shape*, not a rule about who may see what — getting it wrong
 * costs a clumsy error message, never an unintended reader.
 *
 * `tests/unit/reviews-model.test.ts` reads migration 0003 and fails if any of
 * these drifts from the constraint it mirrors.
 */
export const REVIEW_LIMITS = {
  bodyMax: 4000,
  pairingTextMax: 500,
  boxCodeMax: 40,
  durationMin: 1,
  durationMax: 600,
  humidityMin: 0,
  humidityMax: 100,
  yearMin: 1850,
  yearMax: 2200,
  aromaTagsMax: 30,
  pairingTagsMax: 12,
  scoreMin: 0,
  scoreMax: 100,
  thirdNotesMax: 2000,
} as const

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The six sub-scores of §5.4, in the order a cigar gives them up: how it is
 * built, how it draws, how it burns, what it tastes of, where it goes, what it
 * leaves. `reviews_scores_known_keys` accepts these and nothing else.
 */
export const SCORE_KEYS = [
  'construction',
  'draw',
  'burn',
  'aroma',
  'evolution',
  'finish',
] as const

export type ScoreKey = (typeof SCORE_KEYS)[number]
export type Scores = Partial<Record<ScoreKey, number>>

/**
 * Sub-scores are out of ten; the total they produce is out of a hundred.
 *
 * The schema constrains neither — `scores` is an open jsonb whose only rule is
 * its key set — so the scale is a decision, and it is made once here. Ten was
 * chosen over a hundred for a reason that is about the exercise and not about
 * arithmetic: six fields each asking for a number between 0 and 100 is six
 * chances to invent precision one does not have. A cigar's draw is not an
 * 84/100. It is a 7 or an 8, and half-points are as fine as the judgement goes.
 */
export const SUB_SCORE_MAX = 10
export const SUB_SCORE_STEP = 0.5

/**
 * The total of a tasting is the mean of the six, and is not typed by hand.
 *
 * That is the difference the ADR draws between the two kinds, made visible: a
 * `log` is a gesture and carries whatever number its author felt like; a
 * `tasting` is an exercise, and its number is what the exercise produced. If the
 * total could be overridden, the six fields would become decoration.
 *
 * Returns null on an incomplete set rather than averaging what is there — four
 * criteria out of six is not a score out of a hundred, and rounding it to one
 * would be the kind of invented precision the scale above exists to avoid.
 */
export function totalFromScores(scores: Scores): number | null {
  const values = SCORE_KEYS.map((key) => scores[key])
  if (values.some((value) => typeof value !== 'number' || Number.isNaN(value))) return null

  const sum = (values as number[]).reduce((accumulator, value) => accumulator + value, 0)
  const outOfHundred = (sum / SCORE_KEYS.length) * (100 / SUB_SCORE_MAX)
  return Math.round(outOfHundred * 10) / 10
}

/** Drops the keys nobody filled, so `scores` never carries an undefined. */
export function compactScores(scores: Scores): Scores {
  const out: Scores = {}
  for (const key of SCORE_KEYS) {
    const value = scores[key]
    if (typeof value === 'number' && !Number.isNaN(value)) out[key] = value
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Display preference                                                          */
/* -------------------------------------------------------------------------- */

export type ScoreScale = 100 | 20

/**
 * Reads `profile_settings.preferences.score_scale` without trusting it.
 *
 * The column is a free jsonb the member may write; only its `score_scale` key
 * is constrained, and only to the two strings `'100'` and `'20'` — via `->>`,
 * so the value may legitimately arrive as either a JSON number or a JSON string
 * depending on who last wrote it. Both are accepted here. Anything else falls
 * back to 100, which is what §5.4 calls the trade standard.
 */
export function scoreScaleFromPreferences(preferences: unknown): ScoreScale {
  if (preferences && typeof preferences === 'object' && 'score_scale' in preferences) {
    const raw = (preferences as { score_scale?: unknown }).score_scale
    if (raw === 20 || raw === '20') return 20
  }
  return 100
}
