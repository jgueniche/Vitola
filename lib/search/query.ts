import { createSupabaseServerClient, referential } from '@/lib/supabase/server'
import { scoreFromRings } from '@/lib/reviews/rings'

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
  /**
   * The members' weighted note, out of a hundred, or null when nobody has
   * publicly rated this cigar — which is the state of 937 sheets out of 940.
   *
   * Hydrated after the page of results, never joined: `public.cigar_stats` is
   * in another schema (see `cigarIdsRatedAtLeast` above). One `in (…)` over at
   * most `PAGE_SIZE` ids, so it is a fixed second round trip and never an N+1.
   */
  bayesian_score: number | null
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

/**
 * Taxonomy slugs to descriptor ids — a family expands to its descriptors.
 *
 * One param, two grains (see `FACET_PARAMS.aroma`): the facet panel offers the
 * eleven families, the wheel of `/aromes` points at one descriptor, and both
 * write the same `arome=` key. Resolving here rather than in the URL is what
 * lets a family link stay readable — `?arome=boise` rather than nine ids.
 *
 * An unknown slug resolves to nothing, so the search returns nothing rather
 * than ignoring the filter. That is the right way round: a filter the page
 * shows as active must never be silently dropped.
 */
async function aromaDescriptorIds(slugs: string[]): Promise<number[]> {
  if (slugs.length === 0) return []
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('aroma_taxonomy')
    .select('id, parent_id, slug')
    .in('slug', slugs)
  if (error) throw new Error(`Could not resolve the aroma filter: ${error.message}`)

  const matched = data ?? []
  const families = matched.filter((row) => row.parent_id === null).map((row) => row.id)
  const ids = matched.filter((row) => row.parent_id !== null).map((row) => row.id)

  if (families.length > 0) {
    const { data: children, error: childError } = await supabase
      .from('aroma_taxonomy')
      .select('id')
      .in('parent_id', families)
    if (childError) throw new Error(`Could not resolve the aroma filter: ${childError.message}`)
    for (const child of children ?? []) ids.push(child.id)
  }

  return [...new Set(ids)]
}

/**
 * The cigars the members rate at or above a floor of bands.
 *
 * Two round trips rather than a join, and the reason is the schema, not
 * laziness: `public.cigar_stats` and `ref.cigars` live in different schemas,
 * and PostgREST joins inside one. The id list is bounded by the number of
 * cigars anyone has publicly rated — six entries in the whole database today,
 * 940 rows at the theoretical worst — so this is a small `in (…)` and not a
 * page-load risk. If the referential ever outgrows that, the fix is a view in
 * `ref`, not a filter in TypeScript.
 *
 * Reads the weighted note, never the simple mean: a cigar rated once at five
 * bands must not outrank one rated thirty times at four (ADR 0004).
 */
async function cigarIdsRatedAtLeast(bands: number): Promise<string[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('cigar_stats')
    .select('cigar_id')
    .gte('bayesian_score', scoreFromRings(bands))
  if (error) throw new Error(`Could not read the band filter: ${error.message}`)

  return (data ?? []).map((row) => row.cigar_id).filter((id): id is string => id !== null)
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

  /* Both resolve to id lists, so they are read before the search rather than
     inside it — and in parallel, since neither depends on the other. */
  const [aromaIds, ratedIds] = await Promise.all([
    aromaDescriptorIds(facets.aromas),
    facets.minBands
      ? cigarIdsRatedAtLeast(facets.minBands)
      : Promise.resolve<string[] | null>(null),
  ])

  const db = await referential()
  let query = db.from('cigars').select(select, { count: 'exact' }).eq('status', 'published')

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
  /* The vitola is the column that decides whether a sheet is documented: it
     carries the format, and the strength and shade of the seed came with it.
     The three holes are asked one at a time — a sheet lacking all three is in
     all three lists, which is what a contributor looking for work wants. */
  if (facets.completeness === 'renseignee') query = query.not('vitola_id', 'is', null)
  if (facets.completeness === 'sans-vitole') query = query.is('vitola_id', null)
  if (facets.completeness === 'sans-force') query = query.is('strength', null)
  /* An empty integer[] is `{}` to PostgREST — the column is NOT NULL (0025).
     `filter()` rather than `eq()`: the typed helper wants a number[], and an
     array serialises to nothing, where the literal is what the server reads. */
  if (facets.completeness === 'sans-aromes') query = query.filter('aroma_tags', 'eq', '{}')
  /* `overlaps`, not `contains`: picking cèdre and cacao asks for either, the
     way picking two strengths does. Requiring both would turn a widening
     gesture into a narrowing one, which is not what a chip row looks like. */
  if (facets.aromas.length > 0) {
    if (aromaIds.length === 0) return empty(facets)
    query = query.overlaps('aroma_tags', aromaIds)
  }
  if (ratedIds !== null) {
    if (ratedIds.length === 0) return empty(facets)
    query = query.in('id', ratedIds)
  }

  const from = (facets.page - 1) * PAGE_SIZE
  const { data, count, error } = await query
    .order('commercial_name', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    throw new Error(`Faceted search failed: ${error.message}`)
  }

  const total = count ?? 0
  const cigars = await withPublicNote((data ?? []) as unknown as CigarSummary[])
  return {
    cigars,
    total,
    page: facets.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

/**
 * Attaches the members' weighted note to a page of results.
 *
 * One query for the whole page. The note is read and never recomputed — the
 * view's `where visibility = 'public'` is the security boundary of ADR 0004's
 * D3, and an average rebuilt beside it would be a second, unpoliced copy.
 */
async function withPublicNote(cigars: CigarSummary[]): Promise<CigarSummary[]> {
  if (cigars.length === 0) return cigars
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('cigar_stats')
    .select('cigar_id, bayesian_score, review_count')
    .in(
      'cigar_id',
      cigars.map((cigar) => cigar.id),
    )
  /* A note is an ornament on a card: if the view is unreachable the list must
     still render. Nothing else on the page depends on this. */
  if (error) return cigars.map((cigar) => ({ ...cigar, bayesian_score: null }))

  const notes = new Map<string, number | null>()
  for (const row of data ?? []) {
    /* A row with public words but no public score has review_count 0 — that is
       not a note, and rendering its null as zero bands would be a lie. */
    if (row.cigar_id && (row.review_count ?? 0) > 0) notes.set(row.cigar_id, row.bayesian_score)
  }

  return cigars.map((cigar) => ({ ...cigar, bayesian_score: notes.get(cigar.id) ?? null }))
}

/** No row can match, so nothing is asked of the database. */
function empty(facets: Facets): SearchResult {
  return { cigars: [], total: 0, page: facets.page, pageCount: 1 }
}

export type PublishedCounts = {
  total: number
  withVitola: number
  withStrength: number
  withAromas: number
}

/**
 * How much of the referential is documented — four head counts, for the lede
 * of the list. Said on the page because it is the page's truth: 940 sheets
 * and 78 formats is a different site from 940 and 940, and the visitor
 * should not have to discover which one by scrolling. The strength and the
 * aroma profile joined the count with the sourced proposals of 6 septembre
 * 2026: three holes, three numbers, and the facet below opens each one.
 */
export async function publishedCounts(): Promise<PublishedCounts> {
  const db = await referential()
  const published = () =>
    db.from('cigars').select('id', { count: 'exact', head: true }).eq('status', 'published')
  const [all, vitola, strength, aromas] = await Promise.all([
    published(),
    published().not('vitola_id', 'is', null),
    published().not('strength', 'is', null),
    published().filter('aroma_tags', 'neq', '{}'),
  ])
  return {
    total: all.count ?? 0,
    withVitola: vitola.count ?? 0,
    withStrength: strength.count ?? 0,
    withAromas: aromas.count ?? 0,
  }
}
