/**
 * The feed, as rules rather than as queries (ADR 0007).
 *
 * Everything here is pure: the vocabulary of a publication, the bounds
 * migration 0010 writes as CHECK constraints, and the keyset cursor — which is
 * the only piece of the exit criterion of P3 that a test can hold without a
 * database.
 *
 * One thing this file deliberately does NOT contain, exactly as
 * `lib/reviews/model.ts` does not: any notion of *who may read* a publication.
 * The scopes below name audiences so the interface can describe them; the RLS
 * applies them. ADR 0004 established the rule and ADR 0007 inherits it — a
 * query filtering `visibility` is a bug even when it is right, because it
 * outlives the policy it doubles.
 */

import type { Database } from '@/lib/supabase/database.types'
import type { ReviewVisibility } from '@/lib/reviews/model'

export type PostKind = Database['public']['Enums']['post_kind']
export type FeedScope = Database['public']['Enums']['feed_scope']
export type NotificationKind = Database['public']['Enums']['notification_kind']

/* -------------------------------------------------------------------------- */
/* What a publication is                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The four kinds of §5.6, in the order the composer offers the three one may
 * write by hand.
 *
 * `review_share` is absent from that order on purpose: one does not choose it
 * in the composer, one arrives at it from a notebook entry. Offering it here
 * would mean offering a picker of one's own entries inside a text box, and the
 * entry's own page is where its audience is already on screen.
 */
export const COMPOSABLE_POST_KINDS = ['post', 'session', 'question'] as const
export type ComposablePostKind = (typeof COMPOSABLE_POST_KINDS)[number]

export function isComposableKind(value: unknown): value is ComposablePostKind {
  return typeof value === 'string' && (COMPOSABLE_POST_KINDS as readonly string[]).includes(value)
}

/**
 * The kinds a text box alone can produce.
 *
 * `session` is missing because `posts_session_has_cigar` requires one, and a
 * composer that asked for a cigar by slug would be asking someone to type an
 * identifier. The gesture therefore starts where the object already is — the
 * cigar's own page — which is where "j'en fume un" and "noter ce cigare" start
 * too. Three entry points, each next to the thing it is about, rather than one
 * form that has to fetch the other two.
 */
export const FREEFORM_POST_KINDS = ['post', 'question'] as const
export type FreeformPostKind = (typeof FREEFORM_POST_KINDS)[number]

export function isFreeformKind(value: unknown): value is FreeformPostKind {
  return typeof value === 'string' && (FREEFORM_POST_KINDS as readonly string[]).includes(value)
}

/** Whether `posts_session_has_cigar` will demand a cigar for this kind. */
export function kindNeedsCigar(kind: PostKind): boolean {
  return kind === 'session'
}

/**
 * The two scopes a publication may carry.
 *
 * ADR 0007, D2: `private` and `shared` are refused by a CHECK, and the refusal
 * is a product decision rather than a missing feature. Publishing is addressing
 * someone; writing for oneself is the notebook, which exists and defaults to
 * exactly that.
 */
export const POST_SCOPES = ['followers', 'public'] as const satisfies readonly ReviewVisibility[]
export type PostScope = (typeof POST_SCOPES)[number]

export const DEFAULT_POST_SCOPE: PostScope = 'followers'

export function isPostScope(value: unknown): value is PostScope {
  return typeof value === 'string' && (POST_SCOPES as readonly string[]).includes(value)
}

/**
 * Which notebook scopes can reach the feed at all.
 *
 * The same two values, and that is the whole content of the rule: a post can
 * never be more visible than the entry it points at (ADR 0004), a post is never
 * narrower than `followers` (ADR 0007), so an entry narrower than `followers`
 * has no lawful audience on a feed. The screens use this to decide whether to
 * offer the button, and the trigger enforces it whatever the screen does.
 */
export function canReachFeed(visibility: ReviewVisibility): visibility is PostScope {
  return isPostScope(visibility)
}

/**
 * The constraints of `public.posts`, restated for the forms.
 *
 * Duplication of the right kind, for the reason `lib/reviews/model.ts` gives at
 * length: a CHECK refuses in `23514`, which is not a sentence anyone should
 * read. `tests/unit/social-model.test.ts` reads migration 0010 and fails if one
 * of these drifts from the constraint it mirrors.
 */
export const POST_LIMITS = {
  bodyMax: 4000,
  commentMax: 2000,
  /** `least(greatest(…, 1), 50)` in `feed_page()`. A page cannot ask for more. */
  pageMax: 50,
} as const

/** What one page of the feed asks for. Twenty fits a screen without scrolling far. */
export const FEED_PAGE_SIZE = 20

/* -------------------------------------------------------------------------- */
/* The keyset cursor                                                           */
/* -------------------------------------------------------------------------- */

export type FeedCursor = { createdAt: string; id: string }

/**
 * A cursor is `(created_at, id)`, and it travels in the URL as one string.
 *
 * The pair rather than the timestamp alone is the whole of §5.6's requirement,
 * and it is not pedantry: `created_at` is not a total order — two publications
 * written in the same millisecond are indistinguishable by it, and a page that
 * cannot distinguish them either skips one or shows it twice. The identifier
 * breaks the tie, deterministically, and `posts_public_keyset_idx` carries both
 * columns in the order the comparison needs.
 *
 * Encoded as `timestamp~uuid` rather than base64: a cursor is not a secret, and
 * a readable one is a cursor whose bug is visible in the address bar.
 */
const CURSOR_SEPARATOR = '~'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeCursor(cursor: FeedCursor): string {
  return `${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`
}

/**
 * Reads a cursor off the query string, or returns null.
 *
 * Null on anything malformed, and never a throw: the cursor is attacker
 * controlled, it arrives from a link someone may have edited, and the worst a
 * bad one should do is send the reader back to the first page. A rejected
 * cursor costs a page; a trusted one costs a 500 on a route anybody can hit.
 */
export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null

  const separator = raw.lastIndexOf(CURSOR_SEPARATOR)
  if (separator <= 0) return null

  const createdAt = raw.slice(0, separator)
  const id = raw.slice(separator + 1)

  if (!UUID.test(id)) return null
  if (Number.isNaN(Date.parse(createdAt))) return null

  return { createdAt, id }
}

/**
 * The cursor that asks for the page after this one, or null at the end.
 *
 * Null when the page came back short, and that is the only end-of-feed signal
 * this design has — asking the database for a count would cost a second scan of
 * everything the keyset exists to avoid reading. A full last page therefore
 * shows one "suite" link that lands on an empty state, which is a cheaper lie
 * than counting: the reader loses a click, the query stays O(page).
 */
export function nextCursor<T extends FeedCursor>(rows: T[], pageSize: number): string | null {
  if (rows.length < pageSize) return null
  const last = rows[rows.length - 1]
  return last ? encodeCursor(last) : null
}

/* -------------------------------------------------------------------------- */
/* Follows                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What one may do about someone else's account, from their profile.
 *
 * Named here rather than inferred at the point of rendering because the four
 * states are mutually exclusive and one of them is easy to forget: someone may
 * follow you without you following them, and the button then has to say
 * "s'abonner" while a *second* control says "retirer cet abonné". ADR 0007's D1
 * makes that second control the counterweight to a free follow, so a screen
 * that renders one and not the other has dropped the half that protects.
 */
export type FollowState = {
  iFollow: boolean
  followsMe: boolean
  blocked: boolean
}
