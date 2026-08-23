import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  APP_ROLES,
  GRANTABLE_ROLES,
  hasMinRole,
  isGrantableRole,
  REVIEWER_ROLE,
} from '@/lib/settings/roles'

/**
 * The role ladder, checked against the SQL that ranks it.
 *
 * `hasMinRole` is a TypeScript reimplementation of `public.has_min_role()`, and
 * that duplication is deliberate: the screen has to decide what to render
 * before it can ask the database anything, and a round trip per rendered panel
 * would be a query for a decision the page already has the data for. It is the
 * safe kind of duplication — the database re-asks the same question before
 * every write, so a drift here costs a panel shown or hidden wrongly, never an
 * unauthorised write.
 *
 * What must not drift is the **order**, because that is what "and above" means.
 * A role inserted in the wrong rung would silently widen or narrow every
 * `has_min_role` comparison in the codebase, in a direction nobody would see.
 */

const SCHEMA = readFileSync(join(process.cwd(), 'docs/phase-0/03-schema-p1.sql'), 'utf8')

describe('the ladder mirrors public.app_role', () => {
  it('declares the same rungs, in the same order', () => {
    const match = /create type public\.app_role as enum \(([\s\S]*?)\);/.exec(SCHEMA)
    expect(match, 'app_role is no longer declared in the P1 schema').not.toBeNull()

    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((hit) => hit[1])
    expect(declared).toEqual([...APP_ROLES])
  })

  it('ranks the way has_min_role ranks', () => {
    /*
     * The SQL compares by position in the enum. Pinning a few pairs rather than
     * the whole matrix: what these catch is a reordering, and a reordering
     * breaks the pairs at its boundary first.
     */
    expect(hasMinRole('admin', 'editor')).toBe(true)
    expect(hasMinRole('moderator', 'editor')).toBe(true)
    expect(hasMinRole('editor', 'editor')).toBe(true)
    expect(hasMinRole('contributor', 'editor')).toBe(false)
    expect(hasMinRole('member', 'editor')).toBe(false)
    expect(hasMinRole('member', 'member')).toBe(true)
  })

  it('opens the wiki queue at the rung §6 names', () => {
    expect(REVIEWER_ROLE).toBe('editor')
  })
})

describe('what a screen may hand out', () => {
  it('never includes admin', () => {
    /*
     * The one right that compounds. An interface that can mint the role which
     * operates the interface has no floor, and the route refuses to *edit* an
     * admin for the same reason seen from the other side.
     */
    expect(isGrantableRole('admin')).toBe(false)
    expect(GRANTABLE_ROLES).not.toContain('admin')
  })

  it('includes every other rung, so a demotion is possible', () => {
    /*
     * Granting without revoking would be a one-way door: a reviewer who turns
     * out to be a poor one could only be removed by hand in the database, which
     * is exactly the situation this screen exists to end.
     */
    for (const role of APP_ROLES.filter((value) => value !== 'admin')) {
      expect(isGrantableRole(role), `${role} cannot be set from a screen`).toBe(true)
    }
  })

  it('refuses anything that is not a rung', () => {
    for (const bad of [null, undefined, '', 'superadmin', 'ADMIN', 'editor ']) {
      expect(isGrantableRole(bad)).toBe(false)
    }
  })
})

describe('the column stays barred to clients', () => {
  it('appears in no client GRANT', () => {
    /*
     * The reason `/api/roles` is a route and not a Server Action. If this ever
     * passes because someone added `role` to a grant, the route is no longer
     * the only door — and migration 0009 exists precisely because loosening one
     * of the two barriers was the tempting fix.
     */
    const grants = [
      ...SCHEMA.matchAll(/grant (?:update|insert) \(([^)]*)\)\s*\n?\s*on public\.profiles/gi),
    ].map((hit) => hit[1] ?? '')
    expect(grants.length, 'no column-level UPDATE grant on profiles was found').toBeGreaterThan(0)
    for (const columns of grants) {
      expect(columns).not.toMatch(/\brole\b/)
      expect(columns).not.toMatch(/\breputation\b/)
    }
  })
})
