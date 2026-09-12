import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CONSENT_KINDS,
  CONSENT_TRAITS,
  currentConsents,
  DEFAULT_PREFERENCES,
  DEFAULT_PRIVACY,
  readPreferences,
  readPrivacy,
  type ConsentRow,
} from '@/lib/settings/model'

/**
 * The account settings, checked against the SQL that defines their defaults.
 *
 * Two things are pinned here and neither is a bound:
 *
 *   - **the column defaults**, because a form that starts from a different
 *     object than the database does will silently rewrite settings nobody
 *     touched — the first save would "correct" every unmentioned key;
 *   - **`show_humidor: false`**, which ADR 0006 D4 leans on. The humidor's
 *     policies are owner-only in v1 *because* the default says so; flipping it
 *     in SQL without noticing would make P3 open caves nobody chose to open.
 */

const SCHEMA = readFileSync(join(process.cwd(), 'docs/phase-0/03-schema-p1.sql'), 'utf8')

/*
 * `preferences` had its default rewritten by migration 0029, which dropped
 * `score_scale` from it. The phase-0 schema is the record of what P1 created
 * and is not edited after the fact, so the authority on THIS default moved to
 * the migration that last changed it. The privacy default below still reads
 * from the schema: nothing has touched it.
 */
const MIGRATION_0029 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0029_echelle_de_note_retiree.sql'),
  'utf8',
)

describe('the defaults mirror migration 0001', () => {
  it('finds the two column defaults in the schema', () => {
    // Guards the guard: a regex that stops matching would make the assertions
    // below compare a default against itself.
    expect(SCHEMA).toContain('show_humidor')
  })

  it('starts preferences where the column does', () => {
    const match = /set default\s+'([^']+)'::jsonb/.exec(MIGRATION_0029)
    expect(match, 'the preferences default is no longer set by 0029').not.toBeNull()
    expect(JSON.parse(match![1]!)).toEqual(DEFAULT_PREFERENCES)
  })

  it('starts privacy where the column does', () => {
    const match = /privacy\s+jsonb\s+not null default\s+'([^']+)'/.exec(SCHEMA)
    expect(match, 'the privacy default is no longer in 0001').not.toBeNull()
    expect(JSON.parse(match![1]!)).toEqual(DEFAULT_PRIVACY)
  })

  it('keeps the humidor closed by default (ADR 0006, D4)', () => {
    expect(DEFAULT_PRIVACY.show_humidor).toBe(false)
    expect(DEFAULT_PRIVACY.show_reviews).toBe(true)
  })
})

describe('reading a stored blob', () => {
  it('drops what it does not recognise rather than carrying it forward', () => {
    const read = readPreferences({ length_unit: 'in', couleur: 'bleu' })
    expect(read).toEqual({ length_unit: 'in', email_digest: false })
    expect('couleur' in read).toBe(false)
  })

  it('ignores a score scale, which migration 0029 retired', () => {
    // The key survives in old rows: the note is read in bands for everybody
    // now, so carrying it forward would keep a preference nobody can act on.
    const read = readPreferences({ score_scale: '20', length_unit: 'mm' })
    expect('score_scale' in read).toBe(false)
  })

  it('falls back to the defaults on nonsense', () => {
    expect(readPreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(readPreferences('pas un objet')).toEqual(DEFAULT_PREFERENCES)
    expect(readPreferences([1, 2, 3])).toEqual(DEFAULT_PREFERENCES)
  })

  it('treats a missing privacy key as its default, not as false', () => {
    // The asymmetry matters: two of the three default to true, so reading a
    // partial object as "everything off" would silently hide a member.
    expect(readPrivacy({})).toEqual(DEFAULT_PRIVACY)
    expect(readPrivacy({ show_reviews: false }).show_reviews).toBe(false)
    expect(readPrivacy({ show_humidor: true }).show_humidor).toBe(true)
  })
})

describe('the consent register', () => {
  const rows: ConsentRow[] = [
    { kind: 'analytics', granted: true, version: '1', granted_at: '2026-01-01T10:00:00Z' },
    { kind: 'analytics', granted: false, version: '1', granted_at: '2026-06-01T10:00:00Z' },
    { kind: 'terms', granted: true, version: '2', granted_at: '2026-03-01T10:00:00Z' },
  ]

  it('reads the latest row per kind, whatever the order', () => {
    const latest = currentConsents([...rows].reverse())
    expect(latest.get('analytics')?.granted).toBe(false)
    expect(latest.get('terms')?.granted).toBe(true)
  })

  it('knows nothing about a kind that was never recorded', () => {
    expect(currentConsents(rows).has('marketing_email')).toBe(false)
  })

  it('has a trait for every kind of the enum', () => {
    // A kind added to the enum without a trait would render with no legal basis
    // at all, which is the one thing this page must never do.
    expect(Object.keys(CONSENT_TRAITS).sort()).toEqual([...CONSENT_KINDS].sort())
  })

  it('offers no switch for a processing that is not consent-based', () => {
    // art. 7.4: a consent one cannot refuse is not a consent. These three are
    // contract and legal obligation, and must never be rendered as a choice.
    expect(CONSENT_TRAITS.terms.optional).toBe(false)
    expect(CONSENT_TRAITS.privacy.optional).toBe(false)
    expect(CONSENT_TRAITS.age_verification.optional).toBe(false)
  })

  it('records nothing for an optional processing that is not running', () => {
    const optional = CONSENT_KINDS.filter((kind) => CONSENT_TRAITS[kind].optional)
    expect(optional.length).toBeGreaterThan(0)
    // The day one of these turns true, its switch has to ship in the same
    // commit — this assertion is the reminder, and it fails then on purpose.
    expect(optional.every((kind) => CONSENT_TRAITS[kind].active === false)).toBe(true)
  })
})
