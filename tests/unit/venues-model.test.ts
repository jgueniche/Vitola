import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  formatDistance,
  HOURS_DAYS,
  hasHours,
  isVenueType,
  meanRating,
  readHours,
  VENUE_LIMITS,
  VENUE_REVIEW_CRITERIA,
  VENUE_REVIEW_LIMITS,
  VENUE_SEARCH,
  VENUE_TYPES,
  venueSlug,
} from '@/lib/venues/model'

/**
 * The rules of the venue directory, checked against the SQL (migration 0016).
 *
 * `lib/venues/model.ts` restates the CHECK constraints so a refusal reads as a
 * sentence rather than as `23514`, and it derives a slug the migration's CHECK
 * has to accept. Both duplications are pinned here — the groups' rule, third
 * application.
 *
 * The §2 guardrail gets its own assertions: the three criteria are columns,
 * the mean is GENERATED, and this file is where a drift between what the form
 * offers and what the table holds stops being silent.
 */

const M0016 = readFileSync(join(process.cwd(), 'supabase/migrations/0016_lieux.sql'), 'utf8')

describe('the bounds mirror migration 0016', () => {
  it('bounds a venue name the way venues_name_len does', () => {
    const match = /venues_name_len\s+check \(length\(btrim\(name\)\) between (\d+) and (\d+)\)/.exec(
      M0016,
    )
    expect(match, 'venues_name_len is no longer in migration 0016').not.toBeNull()
    expect(Number(match?.[1])).toBe(VENUE_LIMITS.nameMin)
    expect(Number(match?.[2])).toBe(VENUE_LIMITS.nameMax)
  })

  it('bounds a city the way venues_city_len does', () => {
    const match = /venues_city_len\s+check \(length\(btrim\(city\)\) between (\d+) and (\d+)\)/.exec(
      M0016,
    )
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBe(VENUE_LIMITS.cityMin)
    expect(Number(match?.[2])).toBe(VENUE_LIMITS.cityMax)
  })

  it('bounds an address, a phone and a review body the way the CHECKs do', () => {
    expect(M0016).toContain(`length(address) <= ${VENUE_LIMITS.addressMax}`)
    expect(M0016).toContain(`length(phone) <= ${VENUE_LIMITS.phoneMax}`)
    expect(M0016).toContain(`length(body) <= ${VENUE_REVIEW_LIMITS.bodyMax}`)
  })

  it('bounds the search radius the way venues_nearby() raises', () => {
    const match = /radius_km < (\d+) or radius_km > (\d+)/.exec(M0016)
    expect(match, 'the radius guard is no longer in venues_nearby()').not.toBeNull()
    expect(Number(match?.[1])).toBe(VENUE_SEARCH.radiusMinKm)
    expect(Number(match?.[2])).toBe(VENUE_SEARCH.radiusMaxKm)
  })

  it('lists exactly the venue_type values of the enum', () => {
    const block = /create type public\.venue_type as enum \(([\s\S]*?)\);/.exec(M0016)
    expect(block).not.toBeNull()
    const declared = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect([...VENUE_TYPES].sort()).toEqual([...declared].sort())
  })

  it('knows the seven hour keys the CHECK allows', () => {
    const match = /hours - array\[([^\]]+)\]/.exec(M0016)
    expect(match, 'venues_hours_known_days is no longer in migration 0016').not.toBeNull()
    const declared = [...(match?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((hit) => hit[1])
    expect([...HOURS_DAYS]).toEqual(declared)
  })
})

describe('the §2 guardrail is the shape of the data', () => {
  it('the three criteria are the three §5.7 names, and the migration inserts exactly them', () => {
    expect(VENUE_REVIEW_CRITERIA).toEqual(['welcome', 'comfort', 'advice'])
    /* The migration's own self-check compares the INSERT grant to this exact
       column list; here we pin that the constant and the grant agree, so the
       form cannot offer a fourth criterion the table would refuse — or worse,
       one it would take. */
    expect(M0016).toContain(
      "if cols is distinct from 'advice, body, comfort, user_id, venue_id, welcome'",
    )
  })

  it('the mean is generated, never written', () => {
    expect(M0016).toMatch(/rating numeric\(2,1\) generated always as/)
  })

  it('each criterion is bounded 1..5 by a CHECK', () => {
    for (const criterion of VENUE_REVIEW_CRITERIA) {
      expect(M0016).toContain(
        `check (${criterion} between ${VENUE_REVIEW_LIMITS.criterionMin} and ${VENUE_REVIEW_LIMITS.criterionMax})`,
      )
    }
  })
})

describe('venueSlug', () => {
  it('produces what venues_slug_format accepts', () => {
    const pattern = /venues_slug_format\s+check \(slug ~ '([^']+)'\)/.exec(M0016)
    expect(pattern).not.toBeNull()
    const check = new RegExp(pattern![1]!)

    for (const [name, city] of [
      ['A la Civette', 'Paris'],
      ["L'Oratoire", 'Paris'],
      ['Café — le "Balto"', 'Saint-Étienne'],
      ['N°7', 'Nice'],
      ['   Le  Havane   ', 'Le Havre'],
    ] as const) {
      const slug = venueSlug(name, city)
      expect(slug.length).toBeGreaterThan(0)
      expect(slug, `"${name}" gave "${slug}"`).toMatch(check)
    }
  })

  it('returns empty on a name made of punctuation, so the action can refuse it', () => {
    expect(venueSlug('!!!', '???')).toBe('')
  })
})

describe('readHours', () => {
  it('drops unknown keys and blank values, keeps the seven days in order', () => {
    expect(
      readHours({ mon: '09:00–19:00', xxx: 'nope', sun: '  ', sat: 'fermé' }),
    ).toEqual({ mon: '09:00–19:00', sat: 'fermé' })
    expect(readHours(null)).toEqual({})
    expect(readHours(['mon'])).toEqual({})
    expect(hasHours({})).toBe(false)
    expect(hasHours({ wed: '10:00–19:00' })).toBe(true)
  })
})

describe('formatDistance', () => {
  it('reads as metres under a kilometre, French decimals above', () => {
    expect(formatDistance(42)).toBe('42 m')
    expect(formatDistance(999)).toBe('999 m')
    expect(formatDistance(4517)).toBe('4,5 km')
    expect(formatDistance(23_400)).toBe('23 km')
    expect(formatDistance(Number.NaN)).toBe('')
  })
})

describe('meanRating', () => {
  it('is null over nothing and one decimal over something', () => {
    expect(meanRating([])).toBeNull()
    expect(meanRating([4.3, 3.7])).toBe(4)
    expect(meanRating([5, 4, 4])).toBe(4.3)
  })
})

describe('isVenueType', () => {
  it('accepts the enum and refuses the rest', () => {
    expect(isVenueType('civette')).toBe(true)
    expect(isVenueType('bar')).toBe(false)
    expect(isVenueType(3)).toBe(false)
  })
})
