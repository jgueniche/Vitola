/**
 * The moderation vocabulary, in one place (ADR 0013).
 *
 * Everything here mirrors something the database enforces — the two queue
 * scopes of `mod_queue()`, the two decisions and two armed verbs of
 * `mod_decide()`, the four surfaces that carry `hidden_*` columns. The mirror
 * is pinned by `tests/unit/moderation-model.test.ts`, which reads migration
 * 0018 and fails when either side drifts: a verb offered here that the door
 * refuses is a button that cannot work, and a surface armed there but missing
 * here is an act no screen can take.
 */

/** The two tabs of the queue, in the order `mod_queue()` knows them. */
export const MOD_SCOPES = ['open', 'decided'] as const
export type ModScope = (typeof MOD_SCOPES)[number]

/** What a decision can be. `mod.report_status` has two more values — `open`
 *  and `reviewing` — but those are states of the queue, not decisions. */
export const MOD_DECISIONS = ['upheld', 'dismissed'] as const
export type ModDecision = (typeof MOD_DECISIONS)[number]

/** The verbs `mod_decide()` arms in v1. The other three of
 *  `mod.moderation_verb` (`warn`, `suspend`, `delete`) are refused by the door
 *  with a reason — ADR 0013, D4: a verb without an arm makes a record, not an
 *  effect. */
export const MOD_ACT_VERBS = ['hide', 'restore'] as const
export type ModActVerb = (typeof MOD_ACT_VERBS)[number]

/**
 * The four surfaces whose rows carry `hidden_at` / `hidden_by` /
 * `hidden_reason`. Hiding is a fact of the schema, not an intention: offering
 * the verb on any other surface would promise what no column can hold.
 */
export const HIDEABLE_SURFACES = [
  'public.comments',
  'public.posts',
  'public.post_comments',
  'public.venue_reviews',
] as const

export function isHideable(schema: string, table: string): boolean {
  return (HIDEABLE_SURFACES as readonly string[]).includes(`${schema}.${table}`)
}

/** Bounds duplicated from the CHECKs of migration 0004, because `23514` is not
 *  a sentence for anyone. */
export const MOD_LIMITS = {
  note: 2000,
  actReason: 2000,
  queue: 50,
} as const

/** What a `?fait=…` under /moderation may say. */
export const MOD_DONE = {
  acknowledged: 'dossier-pris',
  decided: 'dossier-tranche',
} as const

/**
 * How old a report is, against the announced deadline.
 *
 * `now` is a parameter so the function stays pure and the badge testable —
 * the screen passes `Date.now()`, the test passes a fixed instant.
 */
export function reportAge(
  createdAt: string,
  slaHours: number,
  now: number,
): { hours: number; overdue: boolean } {
  const hours = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 3_600_000))
  return { hours, overdue: hours >= slaHours }
}
