import { referential } from '@/lib/supabase/server'

import { PAGE_SIZE, type Facets } from './facets'
import { toSearchQuery } from './text'

/**
 * The faceted search, and the shape every card renders from.
 *
 * `status = 'published'` is stated explicitly even though RLS already enforces
 * it for anonymous visitors. Two reasons, both load-bearing:
 *   1. A signed-in author CAN see their own drafts. Without this they would
 *      leak into what reads like a public result set.
 *   2. Every facet index is partial — `where status = 'published'`. The
 *      predicate is what lets the planner use them; drop it and the same query
 *      falls back to a sequential scan.
 */
const CIGAR_FIELDS = `
  id, slug, commercial_name, origin_country, strength, wrapper_shade,
  release_year, release_type, msrp_eur, msrp_effective_on
`

export type CigarSummary = {
  id: string
  slug: string
  commercial_name: string
  origin_country: string | null
  strength: string | null
  wrapper_shade: string | null
  release_year: number | null
  release_type: string
  msrp_eur: number | null
  msrp_effective_on: string | null
  brands: { name: string; slug: string; is_cuban: boolean } | null
  vitolas: {
    name_salida: string
    name_galera: string | null
    length_mm: number
    ring_gauge: number
    shape: string
    slug: string
  } | null
}

export type SearchResult = {
  cigars: CigarSummary[]
  total: number
  page: number
  pageCount: number
}

export async function searchCigars(facets: Facets): Promise<SearchResult> {
  // `!inner` only where a filter demands it. `vitola_id` is nullable for 862 of
  // the 940 seeded entries — an unconditional inner join would hide most of the
  // referential the moment the page loads.
  const brandJoin = facets.brand ? 'brands!inner' : 'brands'
  const vitolaJoin = facets.vitola ? 'vitolas!inner' : 'vitolas'
  const select = `${CIGAR_FIELDS},
    ${brandJoin}(name, slug, is_cuban),
    ${vitolaJoin}(name_salida, name_galera, length_mm, ring_gauge, shape, slug)`

  const db = await referential()
  let query = db
    .from('cigars')
    .select(select, { count: 'exact' })
    .eq('status', 'published')

  if (facets.query) {
    query = query.textSearch('search_vector', toSearchQuery(facets.query), {
      type: 'websearch',
      config: 'simple',
    })
  }
  if (facets.strengths.length > 0) query = query.in('strength', facets.strengths)
  if (facets.shades.length > 0) query = query.in('wrapper_shade', facets.shades)
  if (facets.countries.length > 0) query = query.in('origin_country', facets.countries)
  if (facets.brand) query = query.eq('brands.slug', facets.brand)
  if (facets.vitola) query = query.eq('vitolas.slug', facets.vitola)

  const from = (facets.page - 1) * PAGE_SIZE
  const { data, count, error } = await query
    .order('commercial_name', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    throw new Error(`Faceted search failed: ${error.message}`)
  }

  const total = count ?? 0
  return {
    cigars: (data ?? []) as unknown as CigarSummary[],
    total,
    page: facets.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}
