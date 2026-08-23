import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canReachFeed,
  COMPOSABLE_POST_KINDS,
  decodeCursor,
  DEFAULT_POST_SCOPE,
  encodeCursor,
  FEED_PAGE_SIZE,
  FREEFORM_POST_KINDS,
  isComposableKind,
  isFreeformKind,
  isPostScope,
  kindNeedsCigar,
  nextCursor,
  POST_LIMITS,
  POST_SCOPES,
} from '@/lib/social/model'

/**
 * The feed's rules, checked against the SQL that defines them.
 *
 * Two families of assertion, and they fail for different reasons.
 *
 * The bounds mirror migration 0010 so a refusal reads as a sentence rather than
 * as `23514`; if a later migration loosens a CHECK without the mirror following,
 * a member sees an error for a value the database would have taken.
 *
 * The cursor is the other half, and it is the one that carries the exit
 * criterion of P3. §5.6 requires keyset pagination on `(created_at, id)` — the
 * pair, not the timestamp — and the reason is a correctness one rather than a
 * performance one: `created_at` alone is not a total order, so a page boundary
 * that lands between two publications of the same millisecond either skips one
 * or repeats it. Everything below about ties exists for that.
 */

const M0010 = readFileSync(join(process.cwd(), 'supabase/migrations/0010_social.sql'), 'utf8')

describe('the bounds mirror migration 0010', () => {
  it('caps a publication at what posts_body_len allows', () => {
    const match = /posts_body_len check \(body is null or length\(body\) <= (\d+)\)/.exec(M0010)
    expect(match, 'posts_body_len is no longer in migration 0010').not.toBeNull()
    expect(Number(match?.[1])).toBe(POST_LIMITS.bodyMax)
  })

  it('caps a comment at what post_comments_body_len allows', () => {
    const match = /post_comments_body_len check \(length\(btrim\(body\)\) between 1 and (\d+)\)/.exec(
      M0010,
    )
    expect(Number(match?.[1])).toBe(POST_LIMITS.commentMax)
  })

  it('never asks for a bigger page than feed_page will serve', () => {
    const match = /least\(greatest\(coalesce\(p_limit, \d+\), 1\), (\d+)\)/.exec(M0010)
    expect(match, 'feed_page no longer bounds its page size').not.toBeNull()
    expect(Number(match?.[1])).toBe(POST_LIMITS.pageMax)
    expect(FEED_PAGE_SIZE).toBeLessThanOrEqual(POST_LIMITS.pageMax)
  })

  it('offers exactly the scopes posts_visibility_publishable accepts', () => {
    const match = /posts_visibility_publishable check \(visibility in \(([^)]+)\)\)/.exec(M0010)
    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((hit) => hit[1])
    expect(new Set(declared)).toEqual(new Set(POST_SCOPES))
  })

  it('offers exactly the kinds post_kind declares, minus the one nobody composes', () => {
    const match = /create type public\.post_kind as enum \(([^)]+)\)/.exec(M0010)
    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((hit) => hit[1])
    expect(new Set(declared)).toEqual(new Set([...COMPOSABLE_POST_KINDS, 'review_share']))
  })
})

describe('what may be published', () => {
  it('defaults to the narrower of the two scopes', () => {
    expect(DEFAULT_POST_SCOPE).toBe('followers')
    expect(isPostScope(DEFAULT_POST_SCOPE)).toBe(true)
  })

  it('refuses the two notebook scopes a feed cannot carry', () => {
    expect(isPostScope('private')).toBe(false)
    expect(isPostScope('shared')).toBe(false)
  })

  it('lets exactly the feed scopes reach the feed from the notebook', () => {
    expect(canReachFeed('followers')).toBe(true)
    expect(canReachFeed('public')).toBe(true)
    expect(canReachFeed('private')).toBe(false)
    expect(canReachFeed('shared')).toBe(false)
  })

  it('does not offer review_share in the composer', () => {
    expect(isComposableKind('review_share')).toBe(false)
    expect(isComposableKind('post')).toBe(true)
    expect(isComposableKind('nimporte quoi')).toBe(false)
  })

  it('keeps the kinds that need a cigar out of the free-form composer', () => {
    /*
     * The CHECK and the form have to agree, and the direction of the agreement
     * matters: a kind offered in a text box that the database then refuses is a
     * message nobody can act on, because the missing field is not on screen.
     */
    for (const kind of FREEFORM_POST_KINDS) {
      expect(kindNeedsCigar(kind), `«${kind}» needs a cigar the composer cannot ask for`).toBe(
        false,
      )
    }
    expect(kindNeedsCigar('session')).toBe(true)
    expect(isFreeformKind('session')).toBe(false)
  })

  it('mirrors posts_session_has_cigar', () => {
    const match = /posts_session_has_cigar check \(kind <> '([a-z_]+)' or cigar_id is not null\)/.exec(
      M0010,
    )
    expect(match, 'posts_session_has_cigar is no longer in migration 0010').not.toBeNull()
    expect(kindNeedsCigar(match![1] as never)).toBe(true)
  })
})

describe('the keyset cursor', () => {
  const cursor = { createdAt: '2026-08-23T09:15:00.123Z', id: 'a1000000-0000-4000-8000-000000000001' }

  it('survives a round trip', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('splits on the last separator, so a timestamp may contain one', () => {
    /*
     * `lastIndexOf` and not `split`: a uuid never contains the separator, a
     * timestamp format might one day, and a cursor parsed by the wrong half is
     * a page that silently starts somewhere else.
     */
    expect(decodeCursor('2026-08-23T09:15:00.123Z~a1000000-0000-4000-8000-000000000001')).toEqual(
      cursor,
    )
  })

  it('refuses anything malformed rather than throwing', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'pas-un-curseur',
      '~a1000000-0000-4000-8000-000000000001',
      '2026-08-23T09:15:00.123Z~pas-un-uuid',
      'jamais~a1000000-0000-4000-8000-000000000001',
      "2026-08-23T09:15:00.123Z~'; drop table posts; --",
    ]) {
      expect(decodeCursor(bad), `«${String(bad)}» should not decode`).toBeNull()
    }
  })

  it('stops at a short page and continues at a full one', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      createdAt: '2026-08-23T09:15:00.123Z',
      id: `a1000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    }))

    expect(nextCursor(rows, 20)).toBe(encodeCursor(rows[19]!))
    expect(nextCursor(rows.slice(0, 19), 20)).toBeNull()
    expect(nextCursor([], 20)).toBeNull()
  })

  it('takes the last row of the page, ties included', () => {
    /*
     * The whole reason the identifier is in the cursor. These twenty rows share
     * a timestamp to the millisecond; a cursor carrying only `created_at` would
     * ask for "everything strictly before this instant" and skip the nineteen
     * siblings that have not been read yet.
     */
    const tied = Array.from({ length: 20 }, (_, index) => ({
      createdAt: '2026-08-23T09:15:00.000Z',
      id: `b2000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    }))

    const next = decodeCursor(nextCursor(tied, 20))
    expect(next?.id).toBe(tied[19]!.id)
    expect(next?.createdAt).toBe(tied[0]!.createdAt)
  })
})

describe('the SQL keeps the promises the cursor depends on', () => {
  it('compares the pair, not the timestamp', () => {
    expect(M0010).toContain('(p.created_at, p.id) < (p_before_created_at, p_before_id)')
  })

  it('orders on the pair everywhere it orders', () => {
    const orders = [...M0010.matchAll(/order by [^;]*created_at desc[^;]*/g)].map((hit) => hit[0])
    expect(orders.length).toBeGreaterThan(0)
    for (const order of orders) {
      expect(order, `«${order}» orders on created_at without breaking ties`).toMatch(/id desc/)
    }
  })

  it('indexes the pair in the direction the scan reads it', () => {
    expect(M0010).toContain('on public.posts (created_at desc, id desc)')
    expect(M0010).toContain('on public.posts (author_id, created_at desc, id desc)')
  })

  it('keeps feed_page in caller rights, so the RLS stays the judge', () => {
    const fn = /create or replace function public\.feed_page\([\s\S]*?\nas \$\$/.exec(M0010)
    expect(fn?.[0]).toContain('security invoker')
    expect(fn?.[0]).not.toContain('security definer')
  })
})
