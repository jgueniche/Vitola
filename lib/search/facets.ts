import { z } from 'zod'

import { Constants } from '@/lib/supabase/database.types'

/**
 * The faceted search state, and its only home: the URL.
 *
 * No client state manager, per app/CLAUDE.md — a search is a GET, so it is
 * shareable, bookmarkable and survives the back button for free. Every page
 * reads `searchParams` on the server and renders the result.
 *
 * The allowed values come from `Constants`, which is generated from the
 * database. Renaming an enum value in SQL therefore breaks the build here,
 * rather than leaving a filter that silently matches nothing.
 */

export const PAGE_SIZE = 24

/** URL keys are French like the path segments (§0.10); identifiers stay English. */
export const FACET_PARAMS = {
  query: 'q',
  strength: 'force',
  shade: 'cape',
  country: 'pays',
  brand: 'marque',
  vitola: 'vitole',
  page: 'page',
} as const

export const STRENGTHS = Constants.ref.Enums.strength
export const WRAPPER_SHADES = Constants.ref.Enums.wrapper_shade

export type Strength = (typeof STRENGTHS)[number]
export type WrapperShade = (typeof WRAPPER_SHADES)[number]

/**
 * A two-letter ISO country code. Kept as a plain pattern rather than an enum:
 * the referential gains origins as it grows, and a closed list here would
 * reject a country the database already accepts.
 */
const COUNTRY = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .describe('ISO 3166-1 alpha-2')

/** Slugs come from the database and are constrained there; mirror the shape only. */
const SLUG = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export type Facets = {
  query: string
  strengths: Strength[]
  shades: WrapperShade[]
  countries: string[]
  brand: string | null
  vitola: string | null
  page: number
}

export const EMPTY_FACETS: Facets = {
  query: '',
  strengths: [],
  shades: [],
  countries: [],
  brand: null,
  vitola: null,
  page: 1,
}

/** Next gives a value, an array, or nothing. Normalise before validating. */
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function keepValid<T>(values: string[], schema: z.ZodType<T>): T[] {
  const kept: T[] = []
  for (const value of values) {
    const parsed = schema.safeParse(value)
    // An unknown facet value is dropped, not rejected. A stale bookmark or a
    // hand-edited URL should return a narrower result, never an error page.
    if (parsed.success && !kept.includes(parsed.data)) kept.push(parsed.data)
  }
  return kept
}

export type RawSearchParams = Record<string, string | string[] | undefined>

export function parseFacets(params: RawSearchParams): Facets {
  const page = Number.parseInt(String(params[FACET_PARAMS.page] ?? '1'), 10)

  return {
    query: String(params[FACET_PARAMS.query] ?? '')
      .trim()
      .slice(0, 120),
    strengths: keepValid(toArray(params[FACET_PARAMS.strength]), z.enum(STRENGTHS)),
    shades: keepValid(toArray(params[FACET_PARAMS.shade]), z.enum(WRAPPER_SHADES)),
    countries: keepValid(
      toArray(params[FACET_PARAMS.country]).map((c) => c.toUpperCase()),
      COUNTRY,
    ),
    brand: keepValid(toArray(params[FACET_PARAMS.brand]), SLUG)[0] ?? null,
    vitola: keepValid(toArray(params[FACET_PARAMS.vitola]), SLUG)[0] ?? null,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  }
}

/** Rebuilds the query string. Used to render every facet as a plain link. */
export function facetsToSearchParams(facets: Facets): URLSearchParams {
  const params = new URLSearchParams()
  if (facets.query) params.set(FACET_PARAMS.query, facets.query)
  for (const s of facets.strengths) params.append(FACET_PARAMS.strength, s)
  for (const s of facets.shades) params.append(FACET_PARAMS.shade, s)
  for (const c of facets.countries) params.append(FACET_PARAMS.country, c)
  if (facets.brand) params.set(FACET_PARAMS.brand, facets.brand)
  if (facets.vitola) params.set(FACET_PARAMS.vitola, facets.vitola)
  if (facets.page > 1) params.set(FACET_PARAMS.page, String(facets.page))
  return params
}

/**
 * Toggling a facet always returns to page 1. Staying on page 7 of a result set
 * that just shrank to two pages is how a filter appears to return nothing.
 */
export function toggleFacet<K extends 'strengths' | 'shades' | 'countries'>(
  facets: Facets,
  key: K,
  value: Facets[K][number],
): Facets {
  const current = facets[key] as string[]
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value]
  return { ...facets, [key]: next, page: 1 } as Facets
}

export function isFacetActive(facets: Facets): boolean {
  return (
    facets.query !== '' ||
    facets.strengths.length > 0 ||
    facets.shades.length > 0 ||
    facets.countries.length > 0 ||
    facets.brand !== null ||
    facets.vitola !== null
  )
}
