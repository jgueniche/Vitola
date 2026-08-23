/**
 * Clubs, events and conversations, as rules rather than as queries (ADR 0010).
 *
 * Pure, like `lib/social/model.ts` beside it. What lives here is the vocabulary
 * of the three, the bounds migration 0014 writes as CHECK constraints, and the
 * one derivation that is not obvious — a slug.
 *
 * As everywhere in `lib/`, nothing here decides who may read what. Five tables
 * and eleven policies do that, plus two RESTRICTIVE ones for blocks.
 */

import type { Database } from '@/lib/supabase/database.types'

export type EventKind = Database['public']['Enums']['event_kind']
export type AttendeeStatus = Database['public']['Enums']['attendee_status']

/* -------------------------------------------------------------------------- */
/* Clubs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The constraints of `public.clubs` and `public.events`, restated for the forms.
 *
 * Duplication of the right kind — a CHECK refuses in `23514`, which is not a
 * sentence anyone reads. `tests/unit/groups-model.test.ts` reads migration 0014
 * and fails if one of these drifts.
 */
export const CLUB_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  descriptionMax: 2000,
} as const

export const EVENT_LIMITS = {
  titleMin: 2,
  titleMax: 120,
  descriptionMax: 4000,
  locationMax: 200,
  capacityMin: 1,
  capacityMax: 10000,
} as const

export const MESSAGE_LIMITS = {
  bodyMin: 1,
  bodyMax: 4000,
} as const

export const EVENT_KINDS = [
  'degustation',
  'rencontre',
  'visite',
  'autre',
] as const satisfies readonly EventKind[]

export const ATTENDEE_STATUSES = [
  'going',
  'maybe',
  'declined',
] as const satisfies readonly AttendeeStatus[]

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value)
}

export function isAttendeeStatus(value: unknown): value is AttendeeStatus {
  return typeof value === 'string' && (ATTENDEE_STATUSES as readonly string[]).includes(value)
}

/** Only "going" moves the counter — "maybe" is not a yes. Mirrors the trigger. */
export function countsAsAttending(status: AttendeeStatus): boolean {
  return status === 'going'
}

/**
 * A club's slug, derived from its name here rather than in the database.
 *
 * `public.slugify()` exists and is what `ref.cigars` uses, but it lives behind
 * a round trip, and this runs while somebody is typing a name — the form shows
 * the address the club will have before it is created, which is the only way
 * to notice that two clubs would collide before one of them fails.
 *
 * It is therefore a duplication of logic and not of a bound, which the repo
 * treats as more expensive: `tests/unit/groups-model.test.ts` compares this
 * against `clubs_slug_format`, so a slug this produces can never be one the
 * CHECK refuses. What it does NOT promise is byte-identical output with
 * `slugify()` — the database is not asked, and the club's slug is whatever this
 * wrote.
 */
export function clubSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Whether an event is still ahead.
 *
 * A plain comparison, and it is here rather than inline because the agenda and
 * the club page both need it and would otherwise each pick a boundary. An event
 * that started an hour ago is still today's event; one that ended yesterday is
 * past. `ends_at` when there is one, `starts_at` otherwise.
 */
export function isUpcoming(
  event: { starts_at: string; ends_at: string | null },
  now = new Date(),
): boolean {
  const end = event.ends_at ? new Date(event.ends_at) : new Date(event.starts_at)
  return end.getTime() >= now.getTime()
}

/**
 * Whether an event is full.
 *
 * Returns false when there is no capacity, which is the common case: most of
 * these are "come if you like". The database does **not** enforce this — no
 * CHECK can compare a count to a column on another row — so this is an
 * interface courtesy and never a guarantee, and the screen says "complet"
 * rather than refusing.
 */
export function isFull(event: { capacity: number | null; attendee_count: number }): boolean {
  return event.capacity !== null && event.attendee_count >= event.capacity
}

/* -------------------------------------------------------------------------- */
/* What a gesture leaves in the URL                                            */
/* -------------------------------------------------------------------------- */

/**
 * The `?fait=…` codes the three sections emit.
 *
 * Declared here rather than beside the Server Actions for a reason the feed
 * already met: a `'use server'` module may only export async functions, so a
 * constant object in one stops the build at page-data collection. They are
 * short French words because they show in an address bar.
 *
 * Most of these gestures remove the very control that ran them — leaving a club
 * hides "Quitter", cancelling an event removes the page — so their confirmation
 * has to arrive with the navigation. A component holding returned state is
 * unmounted in the same render, and nobody reads anything.
 */
export const CLUB_DONE = {
  created: 'cree',
  joined: 'rejoint',
  left: 'parti',
  removed: 'retire',
  deleted: 'dissous',
} as const

export const EVENT_DONE = {
  created: 'annonce',
  answered: 'repondu',
  withdrawn: 'retire',
  cancelled: 'annule',
} as const

export const MESSAGE_DONE = {
  sent: 'envoye',
  read: 'lu',
  deleted: 'supprime',
} as const
