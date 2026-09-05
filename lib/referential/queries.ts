import { referential } from '@/lib/supabase/server'

/**
 * Reads of single referential entities.
 *
 * Every one of these filters `status = 'published'` where the table has a
 * status, for the same two reasons as the faceted search: an author must not
 * see their own draft rendered as if it were public, and the partial indexes
 * only apply when the predicate is stated.
 *
 * A note on the wording of the error messages below: `tooling/check-tokens.ts`
 * forbids the literal `Vitola` outside `lib/brand.ts`, because the commercial
 * name must stay renameable in one place. The trade term for a cigar format is
 * the same word. The guard is case-sensitive, which is what keeps both usable —
 * the format stays lowercase, the brand keeps the capital.
 *
 * `brands`, `vitolas` and `manufacturers` have no status column — they are
 * reference data, readable by anyone, and their RLS policies say so. Only
 * `cigars` carries the draft/published distinction.
 */

export type CigarDetail = {
  id: string
  slug: string
  brand_id: string
  commercial_name: string
  origin_country: string | null
  wrapper_origin: string | null
  binder_origin: string | null
  filler_origins: string[]
  strength: string | null
  wrapper_shade: string | null
  release_year: number | null
  release_type: string
  discontinued_year: number | null
  msrp_eur: number | null
  msrp_effective_on: string | null
  msrp_source: string | null
  verified_at: string | null
  brands: { name: string; slug: string; is_cuban: boolean; country: string | null } | null
  /** The aroma profile of the referential (migration 0025), descriptor ids. */
  aroma_tags: number[]
  lines: { name: string; slug: string } | null
  vitolas: {
    name_salida: string
    name_galera: string | null
    length_mm: number
    ring_gauge: number
    shape: string
    slug: string
    notes: string | null
  } | null
}

export async function getCigarBySlug(slug: string): Promise<CigarDetail | null> {
  const db = await referential()
  const { data, error } = await db
    .from('cigars')
    .select(
      `id, slug, brand_id, commercial_name, origin_country, wrapper_origin, binder_origin,
       filler_origins, strength, wrapper_shade, release_year, release_type,
       discontinued_year, msrp_eur, msrp_effective_on, msrp_source, verified_at, aroma_tags,
       brands(name, slug, is_cuban, country),
       lines(name, slug),
       vitolas(name_salida, name_galera, length_mm, ring_gauge, shape, slug, notes)`,
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw new Error(`Could not read the cigar entry: ${error.message}`)
  return (data as unknown as CigarDetail) ?? null
}

export type BrandSummary = {
  id: string
  name: string
  slug: string
  country: string | null
  is_cuban: boolean
  founded_year: number | null
  description: string | null
  manufacturers: { name: string; slug: string } | null
}

export async function listBrands(): Promise<BrandSummary[]> {
  const db = await referential()
  const { data, error } = await db
    .from('brands')
    .select(
      'id, name, slug, country, is_cuban, founded_year, description, manufacturers(name, slug)',
    )
    .order('name', { ascending: true })

  if (error) throw new Error(`Could not list brands: ${error.message}`)
  return (data ?? []) as unknown as BrandSummary[]
}

export async function getBrandBySlug(slug: string): Promise<BrandSummary | null> {
  const db = await referential()
  const { data, error } = await db
    .from('brands')
    .select(
      'id, name, slug, country, is_cuban, founded_year, description, manufacturers(name, slug)',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Could not read the brand: ${error.message}`)
  return (data as unknown as BrandSummary) ?? null
}

export type VitolaSummary = {
  id: string
  name_salida: string
  name_galera: string | null
  slug: string
  length_mm: number
  ring_gauge: number
  shape: string
  notes: string | null
}

export async function listVitolas(): Promise<VitolaSummary[]> {
  const db = await referential()
  const { data, error } = await db
    .from('vitolas')
    .select('id, name_salida, name_galera, slug, length_mm, ring_gauge, shape, notes')
    .order('ring_gauge', { ascending: true })
    .order('length_mm', { ascending: true })

  if (error) throw new Error(`Could not list vitolas: ${error.message}`)
  return (data ?? []) as unknown as VitolaSummary[]
}

export async function getVitolaBySlug(slug: string): Promise<VitolaSummary | null> {
  const db = await referential()
  const { data, error } = await db
    .from('vitolas')
    .select('id, name_salida, name_galera, slug, length_mm, ring_gauge, shape, notes')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Could not read the vitola: ${error.message}`)
  return (data as unknown as VitolaSummary) ?? null
}

/**
 * The origins that actually occur in the published set.
 *
 * Offering every ISO country as a filter would mostly offer ways to get zero
 * results. Derived from the data instead, so the panel can only narrow to
 * something that exists.
 */
export async function publishedOriginCountries(): Promise<string[]> {
  const db = await referential()
  const { data, error } = await db
    .from('cigars')
    .select('origin_country')
    .eq('status', 'published')
    .not('origin_country', 'is', null)

  if (error) throw new Error(`Could not read the origin facet: ${error.message}`)

  const codes = new Set<string>()
  for (const row of data ?? []) {
    if (row.origin_country) codes.add(row.origin_country)
  }
  return [...codes].sort()
}

/* -------------------------------------------------------------------------- */
/* Box codes                                                                   */
/* -------------------------------------------------------------------------- */

export type BoxCode = {
  kind: 'factory' | 'month' | 'year'
  code: string
  factory_code: string | null
  month: number | null
  year: number | null
  notes: string | null
}

/**
 * The whole box-code reference, eighteen rows.
 *
 * Read in one go rather than looked up per segment: it is eighteen rows, the
 * page shows all of them below the decoder anyway, and a query per letter group
 * would be three round trips to answer one question.
 *
 * `notes` comes back with the row and is rendered, because six of these
 * eighteen are rated "faible" in `supabase/seed/PROVENANCE.md` — the Cuban
 * factory codes were deliberately reshuffled more than once — and the note is
 * where that uncertainty is written. Dropping it here would launder a doubt
 * into a fact.
 */
export async function listBoxCodes(): Promise<BoxCode[]> {
  const db = await referential()
  const { data, error } = await db
    .from('box_codes')
    .select('kind, code, factory_code, month, year, notes')
    .order('kind', { ascending: true })
    .order('month', { ascending: true, nullsFirst: false })
    .order('code', { ascending: true })

  if (error) throw new Error(`Box codes lookup failed: ${error.message}`)
  return (data ?? []) as BoxCode[]
}
