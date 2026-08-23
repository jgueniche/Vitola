import { readPrivacy, type Privacy } from '@/lib/settings/model'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  FEED_PAGE_SIZE,
  nextCursor,
  type FeedCursor,
  type FeedScope,
  type FollowState,
  type NotificationKind,
  type PostKind,
} from './model'
import type { ReviewVisibility } from '@/lib/reviews/model'

/**
 * Reads of the feed (ADR 0007).
 *
 * Not one of these filters an audience, and that is ADR 0004's central rule
 * inherited whole: four SELECT policies on `posts` decide — public, own,
 * followers, moderator — plus a RESTRICTIVE one for blocks, and they compose
 * without a line of TypeScript. The same function therefore returns a different
 * set to each caller, which is correct.
 *
 * What is different here from `lib/reviews/queries.ts` is the shape of the read
 * itself. The notebook hydrates in three round trips — rows, then authors, then
 * cigars — which is a fixed cost and never an N+1. A feed cannot afford even
 * that: it also needs ember counts, comment counts and "did I ember this",
 * which are per-row questions and therefore the classic N+1. So the feed goes
 * through `public.feed_page()`, which answers all of it in **one** call, under
 * the caller's own rights. The exit criterion of P3 is met by construction
 * rather than by discipline.
 */

export type FeedItem = {
  id: string
  author_id: string
  kind: PostKind
  visibility: ReviewVisibility
  body: string | null
  cigar_id: string | null
  review_id: string | null
  ember_count: number
  comment_count: number
  created_at: string
  updated_at: string
  viewer_embered: boolean
  author_handle: string | null
  author_display_name: string | null
  cigar_slug: string | null
  cigar_name: string | null
  brand_name: string | null
}

export type FeedPage = {
  items: FeedItem[]
  next: string | null
}

/**
 * One page of the feed, and the cursor for the next one.
 *
 * `createdAt`/`id` go in as two arguments rather than as an encoded string
 * because the encoding is a URL concern: the database never sees a cursor
 * format, and `lib/social/model.ts` owns the only parser.
 */
export async function readFeedPage(
  scope: FeedScope,
  cursor: FeedCursor | null,
  pageSize: number = FEED_PAGE_SIZE,
): Promise<FeedPage> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('feed_page', {
    p_scope: scope,
    p_before_created_at: cursor?.createdAt ?? undefined,
    p_before_id: cursor?.id ?? undefined,
    p_limit: pageSize,
  })

  if (error) throw new Error(`Could not read the feed: ${error.message}`)

  const items = (data ?? []) as FeedItem[]
  return {
    items,
    next: nextCursor(
      items.map((item) => ({ createdAt: item.created_at, id: item.id })),
      pageSize,
    ),
  }
}

/**
 * One publication, hydrated the same way a feed row is.
 *
 * Deliberately reads `feed_page` rather than `posts`, and the reason is not
 * laziness: a detail page that read the table directly would need its own
 * ember count, its own "did I ember this" and its own author join, which is a
 * second implementation of the rule that the feed already carries. ADR 0007
 * forbids a second keyset; the same argument covers the row shape. The
 * `discover` scope is used because it is the widest — the RLS still decides,
 * and a followers-only post one may read comes back through it.
 *
 * Null covers "no such publication" and "not for you" without distinguishing
 * them, the way the notebook treats an entry one may not open.
 */
export async function getPost(id: string): Promise<FeedItem | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('posts')
    .select('created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not read the publication: ${error.message}`)
  if (!data) return null

  /* One millisecond after the row's own timestamp, so the keyset predicate —
     strictly less than — lets exactly this row through as the first of its
     page. Asking for two and taking the first would be the same trick with a
     wasted row. */
  const justAfter = new Date(new Date(data.created_at).getTime() + 1).toISOString()

  const { items } = await readFeedPage('discover', { createdAt: justAfter, id }, 1)
  const [row] = items
  return row && row.id === id ? row : null
}

/** The comments under a publication. Their RLS follows the publication's. */
export type PostComment = {
  id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
  author: { handle: string; display_name: string | null } | null
}

export async function listPostComments(postId: string): Promise<PostComment[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('post_comments')
    .select('id, author_id, body, created_at, updated_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(`Could not read the comments: ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  /* One follow-up query for every author on the page, never one per comment.
     `profiles.id` is not a foreign key PostgREST can embed from here —
     `post_comments.author_id` points at `auth.users` — which is the same
     reason `lib/reviews/queries.ts` hydrates in two steps. */
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', [...new Set(rows.map((row) => row.author_id))])

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

  return rows.map((row) => ({
    ...row,
    author: byId.get(row.author_id) ?? null,
  }))
}

/**
 * The publication that announces a notebook entry, if one exists.
 *
 * One row at most: nothing forbids two, but the panel that creates them hides
 * itself once there is one, and a unique index would forbid a legitimate case
 * nobody has asked for yet — re-announcing an entry after a year. `maybeSingle`
 * would throw on the second; `limit(1)` renders the first and stays true.
 */
export async function findPostForReview(reviewId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Could not read the publication of this entry: ${error.message}`)
  return data?.[0]?.id ?? null
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

export type PublicProfile = {
  id: string
  handle: string
  display_name: string | null
  bio: string | null
  country: string | null
  city: string | null
  reputation: number
  created_at: string
}

/**
 * A member's public profile, by handle, or null.
 *
 * Null covers three different situations on purpose — no such handle, a member
 * who turned `is_discoverable` off, and someone who has blocked the reader —
 * because distinguishing them is telling one person something about another.
 * `profiles_select_directory` and `profiles_block_restrictive` produce the same
 * empty result, and the page renders the same 404.
 */
export async function getProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, bio, country, city, reputation, created_at')
    .eq('handle', handle)
    .maybeSingle()

  if (error) throw new Error(`Could not read the profile: ${error.message}`)
  return data ?? null
}

/**
 * The three privacy keys of another member.
 *
 * Through `profile_privacy()`, and there is no other way: `profile_settings` is
 * readable by its owner alone, so a direct read of somebody else's row returns
 * nothing rather than a refusal — which reads as "everything is closed" and
 * would hide a profile its owner chose to open (ADR 0006, D4).
 *
 * Two of the three govern what this page *shows*; only `show_humidor` governs
 * what may be *read*, and that one is a policy. Migration 0011 explains the
 * distinction at length, and it is the reason these two are honoured here in
 * TypeScript without breaking the rule that audiences never are: an entry
 * scoped `public` stays public whatever this returns. What the key decides is
 * whether the profile lists it.
 */
export async function readProfilePrivacy(ownerId: string): Promise<Privacy> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('profile_privacy', { owner: ownerId })
  if (error) throw new Error(`Could not read the privacy keys: ${error.message}`)

  return readPrivacy(data)
}

export type FollowCounts = { followers: number; following: number }

/** Two counts, two queries, and never one per row. */
export async function countFollows(userId: string): Promise<FollowCounts> {
  const supabase = await createSupabaseServerClient()

  const [followers, following] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', userId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ])

  return { followers: followers.count ?? 0, following: following.count ?? 0 }
}

/**
 * Where the reader stands with this member: following, followed, blocked.
 *
 * `blocked` reads `blocks` directly rather than `blocks_between()`, and the
 * difference matters: the table is readable only by the blocker, so this
 * answers "have *I* blocked them", which is the question the button asks. The
 * other direction is unanswerable by design — someone who blocked you shows you
 * an absence, not a state — and a screen that tried to render it would be
 * asking for something the ADR deliberately does not provide.
 */
export async function readFollowState(viewerId: string, subjectId: string): Promise<FollowState> {
  const supabase = await createSupabaseServerClient()

  const [mine, theirs, block] = await Promise.all([
    supabase
      .from('follows')
      .select('follower_id', { head: true, count: 'exact' })
      .eq('follower_id', viewerId)
      .eq('followee_id', subjectId),
    supabase
      .from('follows')
      .select('follower_id', { head: true, count: 'exact' })
      .eq('follower_id', subjectId)
      .eq('followee_id', viewerId),
    supabase
      .from('blocks')
      .select('blocker_id', { head: true, count: 'exact' })
      .eq('blocker_id', viewerId)
      .eq('blocked_id', subjectId),
  ])

  return {
    iFollow: (mine.count ?? 0) > 0,
    followsMe: (theirs.count ?? 0) > 0,
    blocked: (block.count ?? 0) > 0,
  }
}

export type PersonRow = { id: string; handle: string; display_name: string | null }

/**
 * Who follows this member, or who they follow.
 *
 * Two queries whatever the length of the list: the identifiers, then the
 * profiles behind them. A profile that comes back missing is not an error — it
 * is `is_discoverable` off, or a block — and the caller renders "Membre"
 * rather than filling the hole with an identifier, which is the rule
 * `lib/reviews/queries.ts` set for authors.
 */
export async function listFollowGraph(
  userId: string,
  direction: 'followers' | 'following',
  limit = 100,
): Promise<PersonRow[]> {
  const supabase = await createSupabaseServerClient()

  const match = direction === 'followers' ? 'followee_id' : 'follower_id'
  const take = direction === 'followers' ? 'follower_id' : 'followee_id'

  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, followee_id')
    .eq(match, userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Could not read the follow graph: ${error.message}`)

  const ids = (data ?? []).map((row) => row[take])
  if (ids.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', ids)

  /* Ordered by the follow, not by the profile query: the graph is what the page
     is listing, and PostgREST does not promise the order of an `in`. */
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return ids.map((id) => byId.get(id)).filter((row): row is PersonRow => row !== undefined)
}

/**
 * The shelf a member chose to show — `privacy.show_humidor` honoured at last.
 *
 * Goes through `shared_humidor_shelf()` rather than through `humidor_items`,
 * and ADR 0007's D5 is the reason: a policy filters rows and cannot project a
 * column set, so what keeps the purchase price of a box of tobacco from
 * crossing to a third party is the function's return type. Reading the table
 * here would return the caller's own lots and nothing else — the RESTRICTIVE
 * policy sees to that — so this is not a shortcut around RLS but the only door.
 */
export type ShelfRow = {
  humidor_id: string
  humidor_name: string
  cigar_id: string
  qty: number
  aging_start_date: string | null
}

export type ShelfCigar = ShelfRow & {
  slug: string | null
  name: string | null
  brand: string | null
}

export async function readSharedShelf(ownerId: string): Promise<ShelfCigar[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('shared_humidor_shelf', { owner: ownerId })
  if (error) throw new Error(`Could not read the shared humidor: ${error.message}`)

  const rows = (data ?? []) as ShelfRow[]
  if (rows.length === 0) return []

  const db = supabase.schema('ref')
  const { data: cigars } = await db
    .from('cigars')
    .select('id, slug, commercial_name, brands(name)')
    .in('id', [...new Set(rows.map((row) => row.cigar_id))])

  const list = (cigars ?? []) as unknown as {
    id: string
    slug: string
    commercial_name: string
    brands: { name: string } | null
  }[]
  const byId = new Map(list.map((cigar) => [cigar.id, cigar]))

  return rows.map((row) => {
    const cigar = byId.get(row.cigar_id)
    return {
      ...row,
      slug: cigar?.slug ?? null,
      name: cigar?.commercial_name ?? null,
      brand: cigar?.brands?.name ?? null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export type NotificationRow = {
  id: string
  kind: NotificationKind
  actor_id: string | null
  post_id: string | null
  review_id: string | null
  created_at: string
  read_at: string | null
  actor: PersonRow | null
}

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, actor_id, post_id, review_id, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Could not read the notifications: ${error.message}`)

  const rows = data ?? []
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => !!id))]

  const byId = new Map<string, PersonRow>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, handle, display_name')
      .in('id', actorIds)
    for (const profile of profiles ?? []) byId.set(profile.id, profile)
  }

  return rows.map((row) => ({
    ...row,
    actor: row.actor_id ? (byId.get(row.actor_id) ?? null) : null,
  }))
}

/** How many are unread. A head count, so the navigation costs no rows. */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createSupabaseServerClient()

  const { count } = await supabase
    .from('notifications')
    .select('id', { head: true, count: 'exact' })
    .is('read_at', null)

  return count ?? 0
}
