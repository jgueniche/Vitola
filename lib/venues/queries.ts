import type { PersonRow } from '@/lib/social/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { readHours, VENUE_SEARCH, type VenueHours, type VenueType } from './model'

/**
 * Reads of the venue directory (ADR 0011).
 *
 * The rule of every query file in `lib/`: **nothing here filters an
 * audience.** Seven policies on `venues` and eight on `venue_reviews` decide —
 * one of them RESTRICTIVE for blocks — and a query that doubled one of them
 * would survive the day the policy changed.
 *
 * Two `.eq('status', 'published')` below look like exactly that, and are not:
 * they are **tab filters**, the `feed_page()` word for "what this list is
 * about". The directory lists what is open; a pending venue is reachable — by
 * its author and the editors, whom the RLS decides — at its own address, which
 * is why `getVenueBySlug` carries no status predicate at all. Same split as
 * `feed_page()` / `post_card()`, and confusing the two cost P3 a page.
 *
 * Hydration follows the notebook's pattern: the rows, then the profiles behind
 * them — a fixed number of queries whatever the length of the list, never an
 * N+1. A profile that comes back missing is `is_discoverable` off or a block,
 * and the caller renders « Membre » rather than filling the hole.
 */

export type VenueFlag = { enabled: boolean; types: readonly VenueType[] }

/**
 * The Q6 lever. `enabled` closes the whole section; `types` in the payload
 * lists what the directory offers — restricting the annuaire after legal
 * advice is an UPDATE of that row, and this is the only reader of it.
 *
 * Falls back to **closed**, like every flag that opens something: a database
 * hiccup must never open a door (lib/flags.ts).
 */
export async function venuesFlag(): Promise<VenueFlag> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled, payload')
      .eq('key', 'venues_enabled')
      .maybeSingle()

    if (!data?.enabled) return { enabled: false, types: [] }
    const raw = (data.payload as { types?: unknown } | null)?.types
    const types = Array.isArray(raw) ? (raw.filter((t) => typeof t === 'string') as VenueType[]) : []
    return { enabled: types.length > 0, types }
  } catch {
    return { enabled: false, types: [] }
  }
}

export type VenueRow = {
  id: string
  type: VenueType
  name: string
  slug: string
  address: string | null
  city: string
  postal_code: string | null
  country: string
  phone: string | null
  website: string | null
  hours: VenueHours
  has_smoking_room: boolean | null
  is_ventilated: boolean | null
  claimed_by: string | null
  created_by: string | null
  status: 'pending' | 'published' | 'closed'
  source: string | null
  source_date: string | null
  created_at: string
}

const VENUE_COLUMNS =
  'id, type, name, slug, address, city, postal_code, country, phone, website, hours, ' +
  'has_smoking_room, is_ventilated, claimed_by, created_by, status, source, source_date, created_at'

type VenueRaw = Omit<VenueRow, 'hours'> & { hours: unknown }

function toVenueRow(row: VenueRaw): VenueRow {
  return { ...row, hours: readHours(row.hours) }
}

/**
 * The directory list — published venues, filtered by what the flag offers,
 * optionally by type and by a text needle on name or city.
 *
 * `ilike` and not the tsvector machinery of `ref.cigars`: two hundred rows of
 * short names do not earn an index of their own, and the needle a person types
 * here is an enseigne or a town, not prose. The day the directory outgrows
 * this, the cigar search is the model to copy.
 */
export async function listVenues(options: {
  offeredTypes: readonly VenueType[]
  type?: VenueType
  q?: string
}): Promise<VenueRow[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('venues')
    .select(VENUE_COLUMNS)
    .eq('status', 'published')
    .in('type', [...(options.type ? [options.type] : options.offeredTypes)])
    .order('city', { ascending: true })
    .order('name', { ascending: true })
    .limit(VENUE_SEARCH.maxRows)

  const needle = options.q?.trim()
  if (needle) {
    const escaped = needle.replace(/[%_]/g, '\\$&')
    query = query.or(`name.ilike.%${escaped}%,city.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Could not read the venues: ${error.message}`)
  return ((data ?? []) as unknown as VenueRaw[]).map(toVenueRow)
}

export type NearbyVenue = {
  id: string
  slug: string
  name: string
  type: VenueType
  address: string | null
  city: string
  postal_code: string | null
  has_smoking_room: boolean | null
  is_ventilated: boolean | null
  distance_m: number
}

/**
 * The §9 search: published venues within `radiusKm`, nearest first, through
 * `venues_nearby()` — SECURITY INVOKER, one call, GiST underneath.
 */
export async function venuesNearby(options: {
  lat: number
  lng: number
  radiusKm: number
  offeredTypes: readonly VenueType[]
  type?: VenueType
}): Promise<NearbyVenue[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('venues_nearby', {
    lat: options.lat,
    lng: options.lng,
    radius_km: options.radiusKm,
    venue_types: [...(options.type ? [options.type] : options.offeredTypes)],
    max_rows: VENUE_SEARCH.maxRows,
  })

  if (error) throw new Error(`Could not search venues by distance: ${error.message}`)
  return (data ?? []) as NearbyVenue[]
}

/** One venue at its address. No status predicate: the RLS is the audience. */
export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('venues')
    .select(VENUE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Could not read the venue: ${error.message}`)
  return data ? toVenueRow(data as unknown as VenueRaw) : null
}

/**
 * The pending queue, as the RLS serves it to this caller: an editor reads all
 * of it, a member reads their own proposals, a visitor reads nothing. The
 * caller labels the section accordingly — the query cannot tell and does not
 * try, which is the point.
 */
export async function listPendingVenues(): Promise<VenueRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('venues')
    .select(VENUE_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) throw new Error(`Could not read pending venues: ${error.message}`)
  return ((data ?? []) as unknown as VenueRaw[]).map(toVenueRow)
}

export type VenueReviewRow = {
  id: string
  venue_id: string
  user_id: string
  welcome: number
  comfort: number
  advice: number
  rating: number
  body: string | null
  created_at: string
  updated_at: string
  author: PersonRow | null
}

/**
 * The reviews of one venue, newest first, their authors hydrated in a second
 * query. What the RLS renders here already excludes hidden reviews (except
 * from their author) and blocked authors (both directions) — this list is what
 * the caller may read, and the mean on the sheet is computed over exactly it.
 */
export async function listVenueReviews(venueId: string): Promise<VenueReviewRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('venue_reviews')
    .select('id, venue_id, user_id, welcome, comfort, advice, rating, body, created_at, updated_at')
    .eq('venue_id', venueId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Could not read the venue reviews: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []

  const authorIds = [...new Set(rows.map((row) => row.user_id))]
  const { data: people } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', authorIds)

  const byId = new Map((people ?? []).map((person) => [person.id, person as PersonRow]))
  /* `rating` is GENERATED STORED from three NOT NULL columns, so it is never
     null in a row that exists — the generated types cannot know that. */
  return rows.map((row) => ({ ...row, rating: row.rating ?? 0, author: byId.get(row.user_id) ?? null }))
}

/**
 * The reader's own review of this venue, hidden or not — it prefills the form,
 * and an author keeps seeing their hidden review (`venue_reviews_select_own`).
 */
export async function myVenueReview(
  venueId: string,
  userId: string,
): Promise<Omit<VenueReviewRow, 'author'> | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('venue_reviews')
    .select('id, venue_id, user_id, welcome, comfort, advice, rating, body, created_at, updated_at')
    .eq('venue_id', venueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Could not read your venue review: ${error.message}`)
  return data ? { ...data, rating: data.rating ?? 0 } : null
}

export type VenueEventRow = {
  id: string
  title: string
  kind: string
  starts_at: string
  location_text: string | null
}

/** What is announced at this venue, next first. `events_select_all` — no predicate. */
export async function upcomingEventsAtVenue(venueId: string): Promise<VenueEventRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('events')
    .select('id, title, kind, starts_at, location_text')
    .eq('venue_id', venueId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(10)

  if (error) throw new Error(`Could not read the venue events: ${error.message}`)
  return (data ?? []) as VenueEventRow[]
}
