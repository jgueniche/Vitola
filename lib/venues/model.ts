/**
 * The venue directory, as rules rather than as queries (ADR 0011).
 *
 * Pure, like `lib/social/groups.ts` beside it. What lives here is the
 * vocabulary of `public.venues`, the bounds migration 0016 writes as CHECK
 * constraints, the shape of the `hours` object, and one derivation — a slug.
 *
 * As everywhere in `lib/`, nothing here decides who may read what: seven
 * policies on `venues` and eight on `venue_reviews` do, one of them
 * RESTRICTIVE. And nothing here computes a rating — `venue_reviews.rating` is
 * a GENERATED column, the §2 guardrail made structural, and recomputing it in
 * TypeScript would be a second author for a number that must have one.
 */

import type { Database } from '@/lib/supabase/database.types'

export type VenueType = Database['public']['Enums']['venue_type']
export type VenueStatus = Database['public']['Enums']['venue_status']

/**
 * The bounds of `public.venues` and `public.venue_reviews`, restated for the
 * forms. Duplication of the right kind — a CHECK refuses in `23514`, which is
 * not a sentence anyone reads. `tests/unit/venues-model.test.ts` reads
 * migration 0016 and fails if one of these drifts.
 */
export const VENUE_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  cityMin: 1,
  cityMax: 80,
  addressMax: 200,
  postalCodeMax: 10,
  phoneMax: 30,
  websiteMax: 199,
  hoursDayMax: 80,
} as const

export const VENUE_REVIEW_LIMITS = {
  criterionMin: 1,
  criterionMax: 5,
  bodyMax: 2000,
} as const

/** The search bounds `venues_nearby()` enforces with a raise. */
export const VENUE_SEARCH = {
  radiusMinKm: 1,
  radiusMaxKm: 100,
  radiusDefaultKm: 25,
  maxRows: 100,
} as const

export const VENUE_TYPES = [
  'civette',
  'cave',
  'lounge',
  'hotel',
  'restaurant',
  'club',
  'evenement',
] as const satisfies readonly VenueType[]

export function isVenueType(value: unknown): value is VenueType {
  return typeof value === 'string' && (VENUE_TYPES as readonly string[]).includes(value)
}

/**
 * The three criteria of a venue review, in the order the §5.7 sentence gives
 * them: « l'accueil, le confort, le conseil ». They are columns, not a config —
 * adding one is an ADR (0011), not an interface tweak — and this array exists
 * so the form and the reader iterate in one agreed order.
 */
export const VENUE_REVIEW_CRITERIA = ['welcome', 'comfort', 'advice'] as const

export type VenueReviewCriterion = (typeof VENUE_REVIEW_CRITERIA)[number]

/**
 * The `hours` object: keys are these seven, each value a free sentence
 * (« 09:00–19:00 », « fermé »). The CHECK `venues_hours_known_days` refuses any
 * other key; the per-day length lives only in Zod, because a CHECK over every
 * value of a jsonb object is heavier than what it guards.
 */
export const HOURS_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type HoursDay = (typeof HOURS_DAYS)[number]
export type VenueHours = Partial<Record<HoursDay, string>>

/** The `hours` jsonb as the screen reads it: unknown keys dropped, order fixed. */
export function readHours(value: unknown): VenueHours {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const hours: VenueHours = {}
  for (const day of HOURS_DAYS) {
    const entry = (value as Record<string, unknown>)[day]
    if (typeof entry === 'string' && entry.trim().length > 0) hours[day] = entry.trim()
  }
  return hours
}

export function hasHours(hours: VenueHours): boolean {
  return HOURS_DAYS.some((day) => hours[day] !== undefined)
}

/**
 * A venue's slug — the club rule (`clubSlug`) with the city folded in, because
 * an enseigne is nothing like unique: every third civette is « Le Balto ».
 * Uniqueness is still the index's job (`venues_slug_key`); the action retries
 * with a numeric suffix on `23505`, exactly the seed's rule.
 *
 * Duplication of logic, pinned by `tests/unit/venues-model.test.ts` against
 * `venues_slug_format` so a slug produced here is never one the CHECK refuses.
 */
export function venueSlug(name: string, city: string): string {
  return `${name} ${city}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '')
}

/**
 * A distance as a person reads one: metres under a kilometre, one decimal
 * above. French locale, comma included — this string goes on screen.
 */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return ''
  if (metres < 1000) return `${Math.round(metres)} m`
  const km = metres / 1000
  const rounded = km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km))
  return `${rounded} km`
}

/**
 * The mean of the *visible* reviews, for the sheet's header. Presentation math
 * over what the RLS already rendered — never a security filter, and never the
 * per-review rating, which the database generates. One decimal, as `rating`
 * itself is stored.
 */
export function meanRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null
  const sum = ratings.reduce((total, value) => total + value, 0)
  return Math.round((sum / ratings.length) * 10) / 10
}

/** What a gesture leaves in the URL — the `?fait=…` rule of the groups. */
export const VENUE_DONE = {
  proposed: 'proposee',
  published: 'publiee',
  closed: 'fermee',
  withdrawn: 'retiree',
  reviewed: 'notee',
  reviewDeleted: 'avis-retire',
} as const
