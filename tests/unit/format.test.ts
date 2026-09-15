import { describe, expect, it } from 'vitest'

import {
  formatDimensions,
  initials,
  fromBrandZoneWallClock,
  millimetresToInches,
  toBrandZoneWallClock,
  todayInBrandZone,
} from '@/lib/format'

describe('formatDimensions', () => {
  it('writes cepo × length the way a box does', () => {
    expect(formatDimensions(52, 150)).toBe('52 × 150 mm')
  })
})

describe('millimetresToInches', () => {
  it('converts to one decimal, the trade norm', () => {
    expect(millimetresToInches(124)).toBe(4.9)
    expect(millimetresToInches(192)).toBe(7.6)
  })
})

describe('todayInBrandZone', () => {
  it('formats as the YYYY-MM-DD an <input type="date"> wants', () => {
    expect(todayInBrandZone(new Date('2026-08-22T12:00:00Z'))).toBe('2026-08-22')
  })

  it("is the audience's day, not the server's", () => {
    // 00:30 in Paris on the 23rd is still the 22nd in UTC. A server rendering
    // UTC would offer yesterday as the default for "quand l'avez-vous fumé",
    // at exactly the hour someone puts a cigar down and writes it up.
    expect(todayInBrandZone(new Date('2026-08-22T22:30:00Z'))).toBe('2026-08-23')
  })
})

/**
 * The two-hour bug that would never have shown up in a test written in UTC.
 *
 * A `<input type="datetime-local">` gives a wall clock with no zone; PostgREST
 * runs in UTC. Announce a tasting for 20 h in July and it is stored at 20 h
 * UTC, which is 22 h in Paris — and nobody notices until somebody arrives late.
 */
describe('fromBrandZoneWallClock', () => {
  it('reads a summer evening as Paris time, not as UTC', () => {
    /* CEST, +02:00 */
    expect(fromBrandZoneWallClock('2026-07-15T20:00')?.toISOString()).toBe(
      '2026-07-15T18:00:00.000Z',
    )
  })

  it('reads a winter evening with the other offset', () => {
    /* CET, +01:00 */
    expect(fromBrandZoneWallClock('2026-01-15T20:00')?.toISOString()).toBe(
      '2026-01-15T19:00:00.000Z',
    )
  })

  it('accepts the seconds a browser sometimes adds', () => {
    expect(fromBrandZoneWallClock('2026-07-15T20:00:00')?.toISOString()).toBe(
      '2026-07-15T18:00:00.000Z',
    )
  })

  it('refuses anything that is not a wall clock', () => {
    expect(fromBrandZoneWallClock('')).toBeNull()
    expect(fromBrandZoneWallClock('2026-07-15')).toBeNull()
    expect(fromBrandZoneWallClock('demain soir')).toBeNull()
    expect(fromBrandZoneWallClock('2026-13-45T99:99')).toBeNull()
  })

  it('round-trips through the value a form reopens on', () => {
    const instant = fromBrandZoneWallClock('2026-07-15T20:30')
    expect(instant).not.toBeNull()
    expect(toBrandZoneWallClock(instant as Date)).toBe('2026-07-15T20:30')
  })
})

describe('initials', () => {
  it('takes the first and last word of a display name', () => {
    expect(initials({ displayName: 'Test Deux' }, 'fr-FR')).toBe('TD')
    expect(initials({ displayName: 'Jérémy Guéniche' }, 'fr-FR')).toBe('JG')
  })

  it('splits on hyphens and apostrophes, not only on spaces', () => {
    expect(initials({ displayName: 'Jean-Luc' }, 'fr-FR')).toBe('JL')
    expect(initials({ displayName: "d'Arcy" }, 'fr-FR')).toBe('DA')
  })

  it('gives one letter to a single word, never three to three', () => {
    expect(initials({ displayName: 'Colomba' }, 'fr-FR')).toBe('C')
    expect(initials({ displayName: 'Jean Paul Sartre' }, 'fr-FR')).toBe('JS')
  })

  it('keeps the accent of the first character', () => {
    /* [...word][0], not word[0]: a surrogate pair would lose half of itself,
       and « Émile » must not come back as « E ». */
    expect(initials({ displayName: 'Émile Zola' }, 'fr-FR')).toBe('ÉZ')
  })

  it('falls back to the handle, then to the address', () => {
    expect(initials({ displayName: null, handle: 'cigardeur' }, 'fr-FR')).toBe('C')
    expect(initials({ displayName: '   ', handle: '@vitolier' }, 'fr-FR')).toBe('V')
    expect(
      initials({ displayName: null, handle: null, email: 'test1@cigardeur.com' }, 'fr-FR'),
    ).toBe('T')
  })

  it('returns nothing rather than a placeholder when it knows nothing', () => {
    expect(initials({}, 'fr-FR')).toBe('')
    expect(initials({ displayName: null, handle: null, email: null }, 'fr-FR')).toBe('')
  })

  it("uppercases in the locale it is given, not the server's", () => {
    /* The reason the parameter exists: a container running under a Turkish
       locale maps « i » to « İ », which is correct Turkish and wrong here. */
    expect(initials({ displayName: 'inès blanc' }, 'fr-FR')).toBe('IB')
  })
})
