import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

import { scoreScaleFromPreferences, type ReviewKind, type ReviewVisibility, type ScoreScale, type Scores } from './model'

/**
 * Reads of the notebook (ADR 0004).
 *
 * Not one of these filters `visibility`, and that is the ADR's central rule
 * rather than an oversight: "Aucune requête de fil, de statistique ou de fiche
 * ne filtre `visibility` en TypeScript." Four SELECT policies decide instead —
 * public, own, shared-with-me, moderator — and they are OR-ed, so the same
 * query returns a different set to each caller. A `.eq('visibility','public')`
 * added here for safety would double a policy and survive it.
 *
 * The consequence worth knowing before reading further: the *same* function
 * feeds the cigar page for an anonymous visitor and for the author of a private
 * entry, and returns different rows. That is correct.
 *
 * Two queries where one embed would read better, twice over — for authors and
 * for cigars. PostgREST resolves an embed from a foreign key, and neither of
 * these has one it can follow: `reviews.user_id` points at `auth.users` rather
 * than at `public.profiles`, and `reviews.cigar_id` crosses into the `ref`
 * schema. Both follow-ups are a single `in (…)`, so the cost is a fixed second
 * round trip, never an N+1.
 */

export type ReviewAuthor = {
  id: string
  handle: string
  display_name: string | null
}

export type ReviewCigar = {
  id: string
  slug: string
  commercial_name: string
  brand: string | null
}

export type ReviewRow = {
  id: string
  user_id: string
  cigar_id: string
  kind: ReviewKind
  visibility: ReviewVisibility
  score_total: number | null
  scores: Scores
  aroma_tags: number[]
  strength_perceived: string | null
  smoke_duration_min: number | null
  pairing_text: string | null
  pairing_tags: string[]
  box_code: string | null
  production_year: number | null
  purchase_year: number | null
  humidity_pct: number | null
  is_blind: boolean
  body: string | null
  smoked_on: string
  created_at: string
  updated_at: string
}

export type ReviewWithContext = ReviewRow & {
  author: ReviewAuthor | null
  cigar: ReviewCigar | null
}

const COLUMNS =
  `id, user_id, cigar_id, kind, visibility, score_total, scores, aroma_tags,
   strength_perceived, smoke_duration_min, pairing_text, pairing_tags, box_code,
   production_year, purchase_year, humidity_pct, is_blind, body, smoked_on,
   created_at, updated_at`

/** A page of the notebook. Generous, because P2 has no pagination yet. */
const MAX_ROWS = 200

/* -------------------------------------------------------------------------- */
/* Hydration                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A profile that comes back missing is not an error and not a deleted account —
 * erasure cascades entries away. It is a member who turned `is_discoverable`
 * off, and `profiles_select_directory` doing its job. We honour that rather
 * than filling the hole with their identifier.
 */
async function attachAuthors(rows: ReviewRow[]): Promise<Map<string, ReviewAuthor>> {
  if (rows.length === 0) return new Map()

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', [...new Set(rows.map((row) => row.user_id))])

  return new Map((data ?? []).map((profile) => [profile.id, profile]))
}

/**
 * A cigar that comes back missing is a draft, or an entry whose cigar was
 * unpublished after it was written. Left null: the notebook still shows the
 * note and the date, which is more than dropping the row would.
 */
async function attachCigars(rows: ReviewRow[]): Promise<Map<string, ReviewCigar>> {
  if (rows.length === 0) return new Map()

  const db = await referential()
  const { data } = await db
    .from('cigars')
    .select('id, slug, commercial_name, brands(name)')
    .in('id', [...new Set(rows.map((row) => row.cigar_id))])

  const list = (data ?? []) as unknown as {
    id: string
    slug: string
    commercial_name: string
    brands: { name: string } | null
  }[]

  return new Map(
    list.map((cigar) => [
      cigar.id,
      {
        id: cigar.id,
        slug: cigar.slug,
        commercial_name: cigar.commercial_name,
        brand: cigar.brands?.name ?? null,
      },
    ]),
  )
}

async function withContext(rows: ReviewRow[]): Promise<ReviewWithContext[]> {
  const [authors, cigars] = await Promise.all([attachAuthors(rows), attachCigars(rows)])
  return rows.map((row) => ({
    ...row,
    author: authors.get(row.user_id) ?? null,
    cigar: cigars.get(row.cigar_id) ?? null,
  }))
}

/* -------------------------------------------------------------------------- */
/* The notebook                                                                */
/* -------------------------------------------------------------------------- */

export type NotebookFilters = {
  kind?: ReviewKind
  visibility?: ReviewVisibility
  cigarId?: string
}

/**
 * Everything the signed-in member has written, newest smoke first.
 *
 * `user_id = auth.uid()` is stated here even though `reviews_select_own` says
 * it too, and this is not the visibility filter the ADR forbids. The policy
 * decides what may be *read*; this decides what this page is *about*. Without
 * it a moderator — who may read every entry — would open their own notebook and
 * find the whole site in it. The filters below are of the same nature: they
 * narrow a set already decided, they never widen one.
 */
export async function listMyNotebook(
  userId: string,
  filters: NotebookFilters = {},
): Promise<ReviewWithContext[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('reviews')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('smoked_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.visibility) query = query.eq('visibility', filters.visibility)
  if (filters.cigarId) query = query.eq('cigar_id', filters.cigarId)

  const { data, error } = await query
  if (error) throw new Error(`Could not read the notebook: ${error.message}`)

  return withContext((data ?? []) as unknown as ReviewRow[])
}

/**
 * The entries someone shared with this member by name.
 *
 * `review_shares` is read first and `reviews` second rather than joined, and
 * the order is the point: it yields the ids this member was named on, which is
 * exactly what `review_shares_select_involved` allows them to see. The second
 * query then passes through `reviews_select_shared`, so a share pointing at an
 * entry whose scope has since moved back to `private` simply returns nothing.
 * Revoking by narrowing the scope works without touching the share rows.
 */
export async function listSharedWithMe(userId: string): Promise<ReviewWithContext[]> {
  const supabase = await createSupabaseServerClient()

  const { data: shares, error: sharesError } = await supabase
    .from('review_shares')
    .select('review_id')
    .eq('grantee_id', userId)
    .order('granted_at', { ascending: false })
    .limit(MAX_ROWS)

  if (sharesError) throw new Error(`Could not read the shares: ${sharesError.message}`)

  const ids = (shares ?? []).map((share) => share.review_id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('reviews')
    .select(COLUMNS)
    .in('id', ids)
    .order('smoked_on', { ascending: false })

  if (error) throw new Error(`Could not read the shared entries: ${error.message}`)
  return withContext((data ?? []) as unknown as ReviewRow[])
}

/**
 * One entry, or null when the reader may not see it.
 *
 * Null covers "no such entry" and "not for you" without distinguishing them,
 * the same way the cigar page treats a draft as a 404: telling a reader that an
 * entry exists at an id they cannot open is telling them something about
 * someone else's notebook.
 */
export async function getReview(id: string): Promise<ReviewWithContext | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.from('reviews').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`Could not read the entry: ${error.message}`)
  if (!data) return null

  const [row] = await withContext([data as unknown as ReviewRow])
  return row ?? null
}

/** The three thirds of a tasting, in order. Their RLS follows the entry's. */
export async function listThirds(reviewId: string): Promise<{ third: number; notes: string | null }[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('review_thirds')
    .select('third, notes')
    .eq('review_id', reviewId)
    .order('third', { ascending: true })

  if (error) throw new Error(`Could not read the thirds: ${error.message}`)
  return data ?? []
}

/**
 * The entries attached to a cigar entry, as the current reader may see them.
 *
 * Returns public entries to everyone, plus the reader's own and the ones named
 * to them — all four SELECT policies at once, none of them restated here. An
 * author therefore sees their private note in place on the cigar page, which is
 * the behaviour the notebook wants: one writes there, one should read it there.
 */
export async function listReviewsForCigar(cigarId: string): Promise<ReviewWithContext[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('reviews')
    .select(COLUMNS)
    .eq('cigar_id', cigarId)
    .order('smoked_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the entries of this cigar: ${error.message}`)
  return withContext((data ?? []) as unknown as ReviewRow[])
}

/* -------------------------------------------------------------------------- */
/* Sharing                                                                     */
/* -------------------------------------------------------------------------- */

export type ShareRow = { grantee_id: string; granted_at: string; grantee: ReviewAuthor | null }

/** Who an entry has been named to. Author-visible by policy, not by filter. */
export async function listShares(reviewId: string): Promise<ShareRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('review_shares')
    .select('grantee_id, granted_at')
    .eq('review_id', reviewId)
    .order('granted_at', { ascending: true })

  if (error) throw new Error(`Could not read the recipients: ${error.message}`)

  const shares = data ?? []
  if (shares.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', shares.map((share) => share.grantee_id))

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return shares.map((share) => ({ ...share, grantee: byId.get(share.grantee_id) ?? null }))
}

/**
 * Members one may name, matched on handle or display name.
 *
 * `profiles_select_directory` already withholds anyone who set
 * `is_discoverable = false`, so a member who has opted out of the directory is
 * simply not findable here — no exclusion is written, and none should be. The
 * caller is dropped from the results because `review_shares_not_self` would
 * refuse the row anyway, and a control that offers a choice the database
 * refuses is a control that lies.
 */
export async function searchMembers(term: string, excludeId: string): Promise<ReviewAuthor[]> {
  const trimmed = term.trim()
  if (trimmed.length < 2) return []

  const supabase = await createSupabaseServerClient()
  const pattern = `%${trimmed.replace(/[%_]/g, (match) => `\\${match}`)}%`

  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`)
    .neq('id', excludeId)
    .order('handle', { ascending: true })
    .limit(10)

  if (error) throw new Error(`Could not search members: ${error.message}`)
  return data ?? []
}

/* -------------------------------------------------------------------------- */
/* Aromas, stats, preferences                                                  */
/* -------------------------------------------------------------------------- */

/** Labels for the descriptor ids an entry carries. Empty in, empty out. */
export async function aromaLabels(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('aroma_taxonomy')
    .select('id, label_fr')
    .in('id', [...new Set(ids)])

  return new Map((data ?? []).map((row) => [row.id, row.label_fr]))
}

export type CigarStats = {
  review_count: number
  mean_score: number | null
  bayesian_score: number | null
  review_count_90d: number
  mean_score_90d: number | null
  distribution: Record<string, number>
  last_review_at: string | null
}

/**
 * The public rating aggregate of a cigar, or null when nobody has published
 * a scored entry on it — which is the state of all 940 entries today.
 *
 * Read whole and rendered as-is. Nothing recomputes a mean from `reviews` in
 * TypeScript: the view's `where visibility = 'public'` is the security boundary
 * of ADR 0004's D3, a materialized view cannot carry RLS, and an average
 * recomputed beside it would be a second, unpoliced copy of that boundary.
 *
 * The view is grouped by `cigar_id`, so a cigar with no public scored entry has
 * no row at all rather than a row of zeroes. `maybeSingle()` returns null and
 * the page shows an empty state — an invitation, per §4.6.
 */
export async function getCigarStats(cigarId: string): Promise<CigarStats | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('cigar_stats')
    .select(
      'review_count, mean_score, bayesian_score, review_count_90d, mean_score_90d, distribution, last_review_at',
    )
    .eq('cigar_id', cigarId)
    .maybeSingle()

  if (error) throw new Error(`Could not read the ratings: ${error.message}`)
  if (!data) return null

  return {
    review_count: data.review_count ?? 0,
    mean_score: data.mean_score,
    bayesian_score: data.bayesian_score,
    review_count_90d: data.review_count_90d ?? 0,
    mean_score_90d: data.mean_score_90d,
    distribution: (data.distribution ?? {}) as Record<string, number>,
    last_review_at: data.last_review_at,
  }
}

/**
 * The member's display scale (§5.4), out of 100 or out of 20.
 *
 * Falls back to 100 and swallows the error to do it, for the same reason
 * `reportSlaHours()` does: a preference that cannot be read is a preference, not
 * an outage, and a notebook that fails to render because of one is worse than a
 * notebook showing the trade default.
 */
export async function myScoreScale(userId: string): Promise<ScoreScale> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('profile_settings')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle()

    return scoreScaleFromPreferences(data?.preferences)
  } catch {
    return 100
  }
}
