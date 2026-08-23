import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  affectsPublicAverage,
  compactScores,
  countsTowardsPublicAverage,
  DEFAULT_SCOPE,
  REVIEW_LIMITS,
  REVIEW_SCOPES,
  SCOPE_TRAITS,
  SCORE_KEYS,
  scoreScaleFromPreferences,
  SUB_SCORE_MAX,
  totalFromScores,
} from '@/lib/reviews/model'

/**
 * The notebook's rules, checked against the SQL that defines them.
 *
 * `lib/reviews/model.ts` restates the bounds of `public.reviews` so a refusal
 * reads as a sentence rather than as `23514`. That duplication is deliberate and
 * therefore has to be pinned: a CHECK loosened in a later migration without the
 * mirror following would show a member an error for a value the database would
 * happily have taken, which is the most annoying kind of wrong.
 *
 * The scope traits are pinned too, and for a heavier reason. Until P3 this file
 * asserted the *absence* of a `followers` SELECT branch, and required the
 * interface to say the scope reached nobody — ADR 0004's arbitration of 22
 * August turned "say so" into an obligation. Migration 0010 wrote that branch
 * (ADR 0007, D1), so the assertion turned over rather than being deleted: it now
 * requires the branch to exist and the sentence to be gone. Drop the policy and
 * this fails; leave the old warning in the copy and it fails too.
 */

const M0003 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0003_carnet.sql'),
  'utf8',
)

const M0010 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0010_social.sql'),
  'utf8',
)

const MESSAGES = readFileSync(join(process.cwd(), 'messages/fr.json'), 'utf8')

describe('the bounds mirror migration 0003', () => {
  it('caps the body at what reviews_body_len allows', () => {
    const match = /reviews_body_len\s+check \(body is null or length\(body\) <= (\d+)\)/.exec(M0003)
    expect(match, 'reviews_body_len is no longer in migration 0003').not.toBeNull()
    expect(Number(match?.[1])).toBe(REVIEW_LIMITS.bodyMax)
  })

  it('caps the pairing note at what reviews_pairing_len allows', () => {
    const match = /reviews_pairing_len\s+check \(pairing_text is null or length\(pairing_text\) <= (\d+)\)/.exec(
      M0003,
    )
    expect(Number(match?.[1])).toBe(REVIEW_LIMITS.pairingTextMax)
  })

  it('bounds the duration where reviews_duration does', () => {
    const match = /smoke_duration_min between (\d+) and (\d+)/.exec(M0003)
    expect(Number(match?.[1])).toBe(REVIEW_LIMITS.durationMin)
    expect(Number(match?.[2])).toBe(REVIEW_LIMITS.durationMax)
  })

  it('bounds the humidity where reviews_humidity does', () => {
    const match = /humidity_pct between (\d+) and (\d+)/.exec(M0003)
    expect(Number(match?.[1])).toBe(REVIEW_LIMITS.humidityMin)
    expect(Number(match?.[2])).toBe(REVIEW_LIMITS.humidityMax)
  })

  it('caps the tag arrays where the cardinality checks do', () => {
    const aromas = /cardinality\(aroma_tags\)\s*<= (\d+)/.exec(M0003)
    const pairings = /cardinality\(pairing_tags\) <= (\d+)/.exec(M0003)
    expect(Number(aromas?.[1])).toBe(REVIEW_LIMITS.aromaTagsMax)
    expect(Number(pairings?.[1])).toBe(REVIEW_LIMITS.pairingTagsMax)
  })

  it('accepts exactly the six sub-score keys the CHECK names', () => {
    const match = /scores - array\[([^\]]+)\]::text\[\]/.exec(M0003)
    expect(match, 'reviews_scores_known_keys is no longer in migration 0003').not.toBeNull()

    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((hit) => hit[1])
    expect(new Set(declared)).toEqual(new Set(SCORE_KEYS))
  })

  it('defaults to the scope the column defaults to', () => {
    expect(M0003).toContain('public.review_visibility not null default \'private\'')
    expect(DEFAULT_SCOPE).toBe('private')
  })

  it('offers exactly the four values of the enum', () => {
    const match = /create type public\.review_visibility as enum \(([^)]+)\)/.exec(M0003)
    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((hit) => hit[1])
    expect(new Set(declared)).toEqual(new Set(REVIEW_SCOPES))
  })
})

describe('scope traits', () => {
  it('has the followers SELECT branch the scope promises', () => {
    /*
     * Matching on a policy body rather than on the enum value: `followers` has
     * been declared in `review_visibility` since migration 0003 and says nothing
     * there about who can read. What makes the scope real is the branch, and the
     * branch reads `public.follows`.
     */
    const branch = /create policy reviews_select_followers on public\.reviews[\s\S]*?;/.exec(M0010)
    expect(branch, 'the followers SELECT branch has left migration 0010').not.toBeNull()
    expect(branch?.[0]).toMatch(/visibility = 'followers'/)
    expect(branch?.[0]).toMatch(/public\.follows/)
  })

  it('no longer tells anyone the scope reaches nobody', () => {
    /*
     * The other half, and the reason this file reads `messages/fr.json`: an
     * interface that keeps warning about a limit that has been lifted is a worse
     * lie than the one the warning existed to prevent. `followersOpen` replaced
     * it, and says the true thing instead — the audience is free to join.
     */
    expect(MESSAGES).not.toContain('followersUnavailable')
    expect(MESSAGES).toContain('followersOpen')
  })

  it('names people only for the shared scope', () => {
    expect(SCOPE_TRAITS.shared.namesPeople).toBe(true)
    for (const scope of REVIEW_SCOPES.filter((value) => value !== 'shared')) {
      expect(SCOPE_TRAITS[scope].namesPeople).toBe(false)
    }
  })

  it('calls only followers a living audience', () => {
    expect(SCOPE_TRAITS.followers.livingAudience).toBe(true)
    for (const scope of REVIEW_SCOPES.filter((value) => value !== 'followers')) {
      expect(SCOPE_TRAITS[scope].livingAudience).toBe(false)
    }
  })
})

describe('what counts towards the public average', () => {
  it('counts public entries and nothing else — ADR 0004, D3', () => {
    expect(countsTowardsPublicAverage('public')).toBe(true)
    for (const scope of REVIEW_SCOPES.filter((value) => value !== 'public')) {
      expect(countsTowardsPublicAverage(scope)).toBe(false)
    }
  })

  it('refreshes on the way out as well as on the way in', () => {
    // Un-publishing moves the average exactly as much as publishing. A refresh
    // skipped here would leave a withdrawn note still counted.
    expect(affectsPublicAverage(null, 'public')).toBe(true)
    expect(affectsPublicAverage('public', null)).toBe(true)
    expect(affectsPublicAverage('public', 'private')).toBe(true)
    expect(affectsPublicAverage('private', 'public')).toBe(true)
  })

  it('leaves the view alone when neither side was ever public', () => {
    expect(affectsPublicAverage('private', 'shared')).toBe(false)
    expect(affectsPublicAverage(null, 'private')).toBe(false)
    expect(affectsPublicAverage('followers', 'followers')).toBe(false)
  })
})

describe('the total of a tasting', () => {
  const full = { construction: 8, draw: 7, burn: 9, aroma: 8, evolution: 7, finish: 9 }

  it('is the mean of the six criteria, carried up to a hundred', () => {
    // (8+7+9+8+7+9) / 6 = 8, out of ten, so 80 out of a hundred.
    expect(totalFromScores(full)).toBe(80)
  })

  it('rounds to one decimal and no further', () => {
    expect(totalFromScores({ ...full, draw: 7.5 })).toBe(80.8)
  })

  it('reaches both ends of the scale', () => {
    const all = (value: number) =>
      Object.fromEntries(SCORE_KEYS.map((key) => [key, value])) as Record<string, number>
    expect(totalFromScores(all(0))).toBe(0)
    expect(totalFromScores(all(SUB_SCORE_MAX))).toBe(100)
  })

  it('refuses an incomplete set rather than averaging what is there', () => {
    // Four criteria out of six is not a score out of a hundred, and rounding it
    // to one would invent precision the exercise did not produce.
    expect(totalFromScores({ construction: 8, draw: 7 })).toBeNull()
    expect(totalFromScores({})).toBeNull()
    expect(totalFromScores({ ...full, finish: Number.NaN })).toBeNull()
  })
})

describe('compactScores', () => {
  it('drops what nobody filled', () => {
    expect(compactScores({ construction: 8, draw: undefined })).toEqual({ construction: 8 })
  })

  it('keeps a zero, which is a judgement and not an empty field', () => {
    expect(compactScores({ burn: 0 })).toEqual({ burn: 0 })
  })
})

describe('the display scale', () => {
  it('reads twenty whether it was stored as a number or as a string', () => {
    expect(scoreScaleFromPreferences({ score_scale: 20 })).toBe(20)
    expect(scoreScaleFromPreferences({ score_scale: '20' })).toBe(20)
  })

  it('falls back to the trade standard on anything else', () => {
    expect(scoreScaleFromPreferences({ score_scale: 50 })).toBe(100)
    expect(scoreScaleFromPreferences({})).toBe(100)
    expect(scoreScaleFromPreferences(null)).toBe(100)
    expect(scoreScaleFromPreferences('nonsense')).toBe(100)
    expect(scoreScaleFromPreferences(undefined)).toBe(100)
  })
})
