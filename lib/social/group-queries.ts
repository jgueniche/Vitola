import { createSupabaseServerClient } from '@/lib/supabase/server'

import type { AttendeeStatus, EventKind } from './groups'
import type { PersonRow } from './queries'

/**
 * Reads of the clubs, the agenda and the messaging (ADR 0010).
 *
 * Same rule as `lib/social/queries.ts` beside it, and it is worth restating
 * because there are now three files it applies to: **not one of these filters
 * an audience.** Thirteen policies decide — eleven permissive and two
 * RESTRICTIVE ones for blocks — and a query that doubled one of them would
 * survive the day the policy changed.
 *
 * That rule bites differently here than on the feed. `clubs`, `events` and the
 * two membership tables are readable by everyone, including a signed-out
 * visitor, so their policies filter nothing and the temptation to "help" them
 * with a `.eq()` is real. `conversations` and `messages` are the opposite —
 * their policies are the whole of the access rule — and neither this file nor
 * any screen restates it.
 *
 * On round trips: the inbox goes through `conversation_inbox()` (migration
 * 0015) because "who is the other one", "what was the last message" and "how
 * many have I not read" are per-row questions, which is the N+1 shape
 * `feed_page()` exists to avoid. Everything else here hydrates in a fixed
 * number of queries whatever the length of the list — the identifiers, then the
 * profiles behind them — which is the notebook's pattern and never an N+1.
 */

/* -------------------------------------------------------------------------- */
/* Clubs                                                                       */
/* -------------------------------------------------------------------------- */

export type ClubRow = {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  member_count: number
  created_at: string
}

export type ClubCard = ClubRow & { viewer_is_member: boolean }

/**
 * Every club, most crowded first.
 *
 * Two queries: the clubs, then which of them the reader belongs to. The second
 * reads `club_members` filtered on the reader — that is not a doubled policy,
 * because `club_members_select_all` shows everybody's membership and what is
 * being asked here is specifically "mine", which is a question and not a right.
 */
export async function listClubs(viewerId: string | null): Promise<ClubCard[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('clubs')
    .select('id, owner_id, name, slug, description, member_count, created_at')
    .order('member_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Could not read the clubs: ${error.message}`)

  const rows = (data ?? []) as ClubRow[]
  if (rows.length === 0 || !viewerId) {
    return rows.map((row) => ({ ...row, viewer_is_member: false }))
  }

  const { data: mine } = await supabase
    .from('club_members')
    .select('club_id')
    .eq('user_id', viewerId)

  const joined = new Set((mine ?? []).map((row) => row.club_id))
  return rows.map((row) => ({ ...row, viewer_is_member: joined.has(row.id) }))
}

export async function getClubBySlug(slug: string): Promise<ClubRow | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('clubs')
    .select('id, owner_id, name, slug, description, member_count, created_at')
    .eq('slug', slug)
    .limit(1)

  if (error) throw new Error(`Could not read the club: ${error.message}`)
  return ((data ?? [])[0] as ClubRow | undefined) ?? null
}

/**
 * Who is in a club, oldest membership first — the owner is therefore first,
 * because `tg_club_owner_joins()` puts them there at creation.
 *
 * A profile that comes back missing is not an error: it is `is_discoverable`
 * off, or a block. The screen renders "Membre" rather than an identifier, which
 * is the rule `lib/reviews/queries.ts` set for authors.
 */
export async function listClubMembers(clubId: string, limit = 200): Promise<PersonRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('club_members')
    .select('user_id')
    .eq('club_id', clubId)
    .order('joined_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Could not read the club members: ${error.message}`)

  const ids = (data ?? []).map((row) => row.user_id)
  if (ids.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', ids)

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return ids.map((id) => byId.get(id)).filter((row): row is PersonRow => row !== undefined)
}

/** Whether the reader belongs to this club. One row, or none. */
export async function isClubMember(clubId: string, viewerId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient()

  const { count, error } = await supabase
    .from('club_members')
    .select('user_id', { head: true, count: 'exact' })
    .eq('club_id', clubId)
    .eq('user_id', viewerId)

  if (error) throw new Error(`Could not read the membership: ${error.message}`)
  return (count ?? 0) > 0
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export type EventRow = {
  id: string
  host_id: string
  club_id: string | null
  venue_id: string | null
  kind: EventKind
  title: string
  description: string | null
  location_text: string | null
  starts_at: string
  ends_at: string | null
  capacity: number | null
  attendee_count: number
}

export type EventCard = EventRow & {
  club_name: string | null
  club_slug: string | null
  venue_name: string | null
  venue_slug: string | null
  host_handle: string | null
  host_display_name: string | null
  viewer_status: AttendeeStatus | null
}

/**
 * The agenda, or one club's agenda.
 *
 * `from`/`until` are read as an interval on `starts_at`, so "what is ahead" is
 * a decision the caller makes and not one buried here — the club page shows
 * the same list bounded by a club, and a past event still has a page.
 *
 * Four queries at most whatever the number of events: the rows, then the clubs,
 * the hosts and the reader's own answers, each in one `in (…)`. Nothing here
 * grows with the list.
 */
export async function listEvents(options: {
  viewerId: string | null
  clubId?: string
  from?: string | null
  limit?: number
}): Promise<EventCard[]> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('events')
    .select(
      'id, host_id, club_id, venue_id, kind, title, description, location_text, starts_at, ends_at, capacity, attendee_count',
    )
    .order('starts_at', { ascending: true })
    .limit(options.limit ?? 100)

  if (options.clubId) query = query.eq('club_id', options.clubId)
  if (options.from) query = query.gte('starts_at', options.from)

  const { data, error } = await query
  if (error) throw new Error(`Could not read the events: ${error.message}`)

  const rows = (data ?? []) as EventRow[]
  if (rows.length === 0) return []

  const clubIds = [...new Set(rows.map((row) => row.club_id).filter((id): id is string => !!id))]
  const venueIds = [...new Set(rows.map((row) => row.venue_id).filter((id): id is string => !!id))]
  const hostIds = [...new Set(rows.map((row) => row.host_id))]

  const [clubs, venues, hosts, answers] = await Promise.all([
    clubIds.length
      ? supabase.from('clubs').select('id, name, slug').in('id', clubIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    /* A venue that comes back missing is a pending or vanished one: the card
       falls back to location_text rather than leaking a name the RLS withheld. */
    venueIds.length
      ? supabase.from('venues').select('id, name, slug').in('id', venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    supabase.from('profiles').select('id, handle, display_name').in('id', hostIds),
    options.viewerId
      ? supabase
          .from('event_attendees')
          .select('event_id, status')
          .eq('user_id', options.viewerId)
          .in(
            'event_id',
            rows.map((row) => row.id),
          )
      : Promise.resolve({ data: [] as { event_id: string; status: AttendeeStatus }[] }),
  ])

  const clubById = new Map((clubs.data ?? []).map((club) => [club.id, club]))
  const venueById = new Map((venues.data ?? []).map((venue) => [venue.id, venue]))
  const hostById = new Map((hosts.data ?? []).map((host) => [host.id, host]))
  const statusByEvent = new Map((answers.data ?? []).map((row) => [row.event_id, row.status]))

  return rows.map((row) => {
    const club = row.club_id ? clubById.get(row.club_id) : undefined
    const venue = row.venue_id ? venueById.get(row.venue_id) : undefined
    const host = hostById.get(row.host_id)
    return {
      ...row,
      club_name: club?.name ?? null,
      club_slug: club?.slug ?? null,
      venue_name: venue?.name ?? null,
      venue_slug: venue?.slug ?? null,
      host_handle: host?.handle ?? null,
      host_display_name: host?.display_name ?? null,
      viewer_status: statusByEvent.get(row.id) ?? null,
    }
  })
}

export async function getEvent(id: string, viewerId: string | null): Promise<EventCard | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, host_id, club_id, venue_id, kind, title, description, location_text, starts_at, ends_at, capacity, attendee_count',
    )
    .eq('id', id)
    .limit(1)

  if (error) throw new Error(`Could not read the event: ${error.message}`)

  const row = (data ?? [])[0] as EventRow | undefined
  if (!row) return null

  const [club, venue, host, answer] = await Promise.all([
    row.club_id
      ? supabase.from('clubs').select('id, name, slug').eq('id', row.club_id).limit(1)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    row.venue_id
      ? supabase.from('venues').select('id, name, slug').eq('id', row.venue_id).limit(1)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    supabase.from('profiles').select('id, handle, display_name').eq('id', row.host_id).limit(1),
    viewerId
      ? supabase
          .from('event_attendees')
          .select('status')
          .eq('event_id', id)
          .eq('user_id', viewerId)
          .limit(1)
      : Promise.resolve({ data: [] as { status: AttendeeStatus }[] }),
  ])

  return {
    ...row,
    club_name: club.data?.[0]?.name ?? null,
    club_slug: club.data?.[0]?.slug ?? null,
    venue_name: venue.data?.[0]?.name ?? null,
    venue_slug: venue.data?.[0]?.slug ?? null,
    host_handle: host.data?.[0]?.handle ?? null,
    host_display_name: host.data?.[0]?.display_name ?? null,
    viewer_status: answer.data?.[0]?.status ?? null,
  }
}

/** Who answered an event, and how. Two queries, as for a club's members. */
export type Attendee = PersonRow & { status: AttendeeStatus }

export async function listAttendees(eventId: string, limit = 200): Promise<Attendee[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('event_attendees')
    .select('user_id, status')
    .eq('event_id', eventId)
    .order('answered_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Could not read the attendees: ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', [...new Set(rows.map((row) => row.user_id))])

  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return rows
    .map((row) => {
      const profile = byId.get(row.user_id)
      return profile ? { ...profile, status: row.status } : null
    })
    .filter((row): row is Attendee => row !== null)
}

/* -------------------------------------------------------------------------- */
/* Messaging                                                                   */
/* -------------------------------------------------------------------------- */

export type InboxRow = {
  conversation_id: string
  other_id: string
  other_handle: string | null
  other_display_name: string | null
  last_message_at: string | null
  last_body: string | null
  last_sender_id: string | null
  unread_count: number
}

/** How many conversations one page of the inbox holds. See migration 0015. */
export const INBOX_PAGE_SIZE = 100

/**
 * The inbox, in one call.
 *
 * `conversation_inbox()` has no audience predicate at all —
 * `conversations_select_own` and the RESTRICTIVE block policy decide, exactly
 * as `post_card()` leaves it to `posts`' policies. What the function does is
 * spare the three per-conversation round trips this list would otherwise cost.
 *
 * It returns at most `INBOX_PAGE_SIZE` rows and the screen says so when the
 * page is full: a cap that stays quiet reads as a complete list.
 */
export async function readInbox(limit = INBOX_PAGE_SIZE): Promise<InboxRow[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('conversation_inbox', { p_limit: limit })
  if (error) throw new Error(`Could not read the inbox: ${error.message}`)

  return (data ?? []) as InboxRow[]
}

/**
 * One member, by identifier.
 *
 * The conversation page needs a name for its heading and has the other's
 * identifier rather than their handle. A profile that comes back missing is
 * `is_discoverable` off or a block, and the heading says "Membre" — the rule
 * every list in this file already follows, applied to a single row.
 */
export async function getPersonById(id: string): Promise<PersonRow | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not read the member: ${error.message}`)
  return data ?? null
}

export type ConversationRow = {
  id: string
  member_a: string
  member_b: string
  last_message_at: string | null
}

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, member_a, member_b, last_message_at')
    .eq('id', id)
    .limit(1)

  if (error) throw new Error(`Could not read the conversation: ${error.message}`)
  return ((data ?? [])[0] as ConversationRow | undefined) ?? null
}

export type MessageRow = {
  id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
}

export type MessagePage = {
  items: MessageRow[]
  /** The cursor of the page before this one, or null when it is the first. */
  older: string | null
}

/** How many messages one page holds. A conversation grows without bound. */
export const MESSAGE_PAGE_SIZE = 40

/**
 * One page of a conversation, newest first, keyset on `(created_at, id)`.
 *
 * The same total order as the feed and served by `messages_keyset_idx`, which
 * carries both columns in the direction of travel. An offset would repeat or
 * skip a message the moment one arrives mid-read, and a conversation is
 * precisely where that happens.
 *
 * PostgREST expresses the compound comparison as an `or` of two terms, which is
 * what `(created_at, id) < (…, …)` means written out. There is no row-value
 * syntax over the wire.
 */
export async function readMessagePage(
  conversationId: string,
  before: { createdAt: string; id: string } | null,
  pageSize = MESSAGE_PAGE_SIZE,
): Promise<MessagePage> {
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('messages')
    .select('id, sender_id, body, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1)

  if (before) {
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    )
  }

  const { data, error } = await query
  if (error) throw new Error(`Could not read the conversation: ${error.message}`)

  const rows = (data ?? []) as MessageRow[]
  const items = rows.slice(0, pageSize)
  const last = items[items.length - 1]

  return {
    items,
    older: rows.length > pageSize && last ? `${last.created_at}~${last.id}` : null,
  }
}

/**
 * Who the reader may open a conversation with (ADR 0010, D5).
 *
 * The union of "people I follow" and "people who follow me", minus anyone a
 * block stands between. The subtraction is **not** a doubled policy: the INSERT
 * policy on `conversations` refuses either way, and what this list does is stop
 * the screen from offering a name the database will refuse — which is the
 * difference between a form and a trap.
 */
export async function listReachablePeople(viewerId: string, limit = 200): Promise<PersonRow[]> {
  const supabase = await createSupabaseServerClient()

  const [following, followers] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', viewerId).limit(limit),
    supabase.from('follows').select('follower_id').eq('followee_id', viewerId).limit(limit),
  ])

  const ids = [
    ...new Set([
      ...(following.data ?? []).map((row) => row.followee_id),
      ...(followers.data ?? []).map((row) => row.follower_id),
    ]),
  ]
  if (ids.length === 0) return []

  /* A block hides the profile one way round only (migration 0012), so the list
     needs both directions: the person I blocked still has a readable profile,
     and offering to write to them would be offering a refusal. */
  const [profiles, blocked, blockers] = await Promise.all([
    supabase.from('profiles').select('id, handle, display_name').in('id', ids),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', viewerId),
    supabase.rpc('blockers_of_me'),
  ])

  const barred = new Set<string>([
    ...(blocked.data ?? []).map((row) => row.blocked_id),
    ...((blockers.data ?? []) as string[]),
  ])

  return (profiles.data ?? [])
    .filter((profile) => !barred.has(profile.id))
    .sort((a, b) => (a.display_name ?? a.handle).localeCompare(b.display_name ?? b.handle, 'fr'))
}
