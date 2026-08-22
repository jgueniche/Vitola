import { describe, expect, it } from 'vitest'

import {
  draftFromEntries,
  draftHasContent,
  draftStorageKey,
  minutesFromSeconds,
  parseDraft,
} from '@/lib/reviews/draft'

/**
 * The autosaved tasting draft.
 *
 * It lives in `localStorage` rather than in `reviews`, because a half-typed
 * tasting has nowhere to live in that table — `reviews_tasting_has_structure`
 * refuses an empty `scores`, and adding a status column would put unfinished
 * text about somebody's tobacco use into a table the GDPR export walks.
 *
 * The consequence is that the stored string is beyond our control: it survives
 * deploys, it can be a shape from a previous version, and anything on the origin
 * can write to it. So `parseDraft` is the guard, and most of what follows is
 * about it refusing rubbish rather than restoring half a form.
 */

const entries = (pairs: [string, string][]) => pairs

describe('building a draft from a form', () => {
  it('keeps the fields a member would be sorry to retype', () => {
    const draft = draftFromEntries(
      entries([
        ['score_construction', '8'],
        ['third_1', 'Cèdre et poivre.'],
        ['body', 'Belle finale.'],
      ]),
      '2026-08-22T10:00:00.000Z',
    )

    expect(draft.fields).toEqual({
      score_construction: '8',
      third_1: 'Cèdre et poivre.',
      body: 'Belle finale.',
    })
  })

  it('drops routing and React bookkeeping, which is not content', () => {
    const draft = draftFromEntries(
      entries([
        ['cigarId', 'a3d1c2b4-0000-4000-8000-000000000000'],
        ['slug', 'un-cigare'],
        ['$ACTION_ID_abc', 'whatever'],
        ['body', 'gardé'],
      ]),
      'now',
    )

    expect(draft.fields).toEqual({ body: 'gardé' })
  })

  it('collects the aroma ids, which arrive one hidden input at a time', () => {
    const draft = draftFromEntries(
      entries([
        ['aromaTags', '12'],
        ['aromaTags', '31'],
        ['aromaTags', 'pas-un-nombre'],
      ]),
      'now',
    )

    expect(draft.aromaTags).toEqual([12, 31])
  })

  it('keeps the scope, and refuses one the enum does not have', () => {
    expect(draftFromEntries(entries([['visibility', 'public']]), 'now').visibility).toBe('public')
    expect(draftFromEntries(entries([['visibility', 'everyone']]), 'now').visibility).toBe('private')
  })

  it('reads the blind checkbox, which posts "on" or nothing at all', () => {
    expect(draftFromEntries(entries([['isBlind', 'on']]), 'now').isBlind).toBe(true)
    expect(draftFromEntries(entries([]), 'now').isBlind).toBe(false)
  })

  it('skips empty fields so an untouched form is not a draft', () => {
    const draft = draftFromEntries(entries([['body', '']]), 'now')
    expect(draft.fields).toEqual({})
    expect(draftHasContent(draft)).toBe(false)
  })
})

describe('draftHasContent', () => {
  const bare = { startedAt: 'now', fields: {}, aromaTags: [], visibility: 'private' as const, isBlind: false }

  it('is false for a form nobody has touched', () => {
    expect(draftHasContent(bare)).toBe(false)
  })

  it('is true once anything at all has been chosen', () => {
    expect(draftHasContent({ ...bare, fields: { body: 'x' } })).toBe(true)
    expect(draftHasContent({ ...bare, aromaTags: [3] })).toBe(true)
    expect(draftHasContent({ ...bare, isBlind: true })).toBe(true)
    // Widening the scope is a decision, and losing it would be losing a choice
    // the member made deliberately.
    expect(draftHasContent({ ...bare, visibility: 'public' })).toBe(true)
  })
})

describe('parsing what came back out of storage', () => {
  it('round-trips a draft it wrote itself', () => {
    const draft = draftFromEntries(
      entries([
        ['body', 'un mot'],
        ['aromaTags', '7'],
        ['visibility', 'shared'],
      ]),
      '2026-08-22T10:00:00.000Z',
    )

    expect(parseDraft(JSON.stringify(draft))).toEqual(draft)
  })

  it('returns null for nothing, rubbish, or the wrong shape', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('')).toBeNull()
    expect(parseDraft('{ not json')).toBeNull()
    expect(parseDraft('"a string"')).toBeNull()
    expect(parseDraft('null')).toBeNull()
    expect(parseDraft(JSON.stringify({ fields: {} }))).toBeNull()
    expect(parseDraft(JSON.stringify({ startedAt: 'now' }))).toBeNull()
  })

  it('discards field values that are not strings rather than restoring them', () => {
    const parsed = parseDraft(
      JSON.stringify({ startedAt: 'now', fields: { body: 'ok', score_draw: 8 } }),
    )
    expect(parsed?.fields).toEqual({ body: 'ok' })
  })

  it('falls back to the safest scope when the stored one is unknown', () => {
    const parsed = parseDraft(
      JSON.stringify({ startedAt: 'now', fields: {}, visibility: 'world' }),
    )
    expect(parsed?.visibility).toBe('private')
  })

  it('keeps only whole aroma ids', () => {
    const parsed = parseDraft(
      JSON.stringify({ startedAt: 'now', fields: {}, aromaTags: [3, 'x', 4.5, 9] }),
    )
    expect(parsed?.aromaTags).toEqual([3, 9])
  })
})

describe('the storage key', () => {
  it('is per cigar, so two tastings do not overwrite each other', () => {
    expect(draftStorageKey('cohiba-robusto')).not.toBe(draftStorageKey('partagas-serie-d'))
  })
})

describe('minutes from the stopwatch', () => {
  it('rounds to the nearest minute', () => {
    expect(minutesFromSeconds(5400)).toBe(90)
    expect(minutesFromSeconds(89)).toBe(1)
    expect(minutesFromSeconds(91)).toBe(2)
  })

  it('never rounds down to zero, which reviews_duration refuses', () => {
    // A timer stopped after forty seconds must not produce a value the database
    // rejects out of a control the interface offered.
    expect(minutesFromSeconds(40)).toBe(1)
    expect(minutesFromSeconds(1)).toBe(1)
    expect(minutesFromSeconds(0)).toBe(1)
    expect(minutesFromSeconds(-10)).toBe(1)
    expect(minutesFromSeconds(Number.NaN)).toBe(1)
  })

  it('clamps at the ceiling instead of failing the whole form', () => {
    // A timer left running overnight should cost a wrong duration, not a
    // refused tasting.
    expect(minutesFromSeconds(60 * 60 * 24)).toBe(600)
  })
})
