import { describe, expect, it } from 'vitest'

import {
  EMPTY_FACETS,
  facetsToSearchParams,
  isFacetActive,
  parseFacets,
  toggleFacet,
  type Facets,
} from '@/lib/search/facets'

describe('parseFacets', () => {
  it('returns the empty state for no parameters', () => {
    expect(parseFacets({})).toEqual(EMPTY_FACETS)
  })

  it('accepts a single value and an array for the same facet', () => {
    expect(parseFacets({ force: 'corse' }).strengths).toEqual(['corse'])
    expect(parseFacets({ force: ['corse', 'moyen'] }).strengths).toEqual(['corse', 'moyen'])
  })

  /**
   * A hand-edited URL or a bookmark kept across a schema change must narrow the
   * result, never produce an error page. The unknown value is dropped and the
   * rest of the query still applies.
   */
  it('drops unknown facet values instead of failing', () => {
    const facets = parseFacets({ force: ['corse', 'inexistant'] })
    expect(facets.strengths).toEqual(['corse'])
  })

  it('does not repeat a value given twice', () => {
    expect(parseFacets({ force: ['corse', 'corse'] }).strengths).toEqual(['corse'])
  })

  it('upper-cases country codes and rejects malformed ones', () => {
    expect(parseFacets({ pays: ['cu', 'ni'] }).countries).toEqual(['CU', 'NI'])
    expect(parseFacets({ pays: 'Cuba' }).countries).toEqual([])
  })

  it('rejects a slug that is not one', () => {
    expect(parseFacets({ marque: 'cohiba' }).brand).toBe('cohiba')
    expect(parseFacets({ marque: 'Cohíba; drop table' }).brand).toBeNull()
  })

  it('clamps the page number and survives nonsense', () => {
    expect(parseFacets({ page: '3' }).page).toBe(3)
    expect(parseFacets({ page: '0' }).page).toBe(1)
    expect(parseFacets({ page: '-4' }).page).toBe(1)
    expect(parseFacets({ page: 'douze' }).page).toBe(1)
    expect(parseFacets({ page: '99999' }).page).toBe(500)
  })

  it('trims and caps the free-text query', () => {
    expect(parseFacets({ q: '  Cohíba  ' }).query).toBe('Cohíba')
    expect(parseFacets({ q: 'x'.repeat(500) }).query).toHaveLength(120)
  })
})

describe('facetsToSearchParams', () => {
  it('round-trips through parseFacets', () => {
    const facets: Facets = {
      query: 'behike',
      strengths: ['corse'],
      shades: ['maduro', 'oscuro'],
      countries: ['CU'],
      brand: 'cohiba',
      vitola: 'laguito-no-1',
      completeness: 'a-completer',
      page: 4,
    }
    const params = facetsToSearchParams(facets)
    const raw: Record<string, string | string[]> = {}
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key)
      raw[key] = all.length > 1 ? all : (all[0] as string)
    }
    expect(parseFacets(raw)).toEqual(facets)
  })

  it('omits page 1, so the first page has a clean URL', () => {
    expect(facetsToSearchParams({ ...EMPTY_FACETS, page: 1 }).toString()).toBe('')
    expect(facetsToSearchParams({ ...EMPTY_FACETS, page: 2 }).toString()).toBe('page=2')
  })
})

describe('toggleFacet', () => {
  it('adds then removes', () => {
    const once = toggleFacet(EMPTY_FACETS, 'strengths', 'corse')
    expect(once.strengths).toEqual(['corse'])
    expect(toggleFacet(once, 'strengths', 'corse').strengths).toEqual([])
  })

  /**
   * Staying on page 7 of a result set that just shrank to two pages is how a
   * filter appears to return nothing at all.
   */
  it('always returns to the first page', () => {
    const deep: Facets = { ...EMPTY_FACETS, page: 7 }
    expect(toggleFacet(deep, 'shades', 'maduro').page).toBe(1)
  })

  it('leaves the other facets alone', () => {
    const start: Facets = { ...EMPTY_FACETS, query: 'behike', brand: 'cohiba' }
    const next = toggleFacet(start, 'countries', 'CU')
    expect(next.query).toBe('behike')
    expect(next.brand).toBe('cohiba')
  })
})

describe('isFacetActive', () => {
  it('is false only for a pristine search', () => {
    expect(isFacetActive(EMPTY_FACETS)).toBe(false)
    expect(isFacetActive({ ...EMPTY_FACETS, page: 3 })).toBe(false)
    expect(isFacetActive({ ...EMPTY_FACETS, query: 'a' })).toBe(true)
    expect(isFacetActive({ ...EMPTY_FACETS, brand: 'cohiba' })).toBe(true)
  })
})
