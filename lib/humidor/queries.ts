import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

import type { HumidorEventType, HumidorReadingSource } from './model'

/**
 * Reads of the humidor (migration 0008, ADR 0006).
 *
 * Not one of these filters on `user_id`, and unlike the notebook's queries that
 * is not a nuance — it is the whole of the access rule. `humidors` has exactly
 * one SELECT policy, `user_id = auth.uid()`, and the three other tables reach it
 * through an `EXISTS`. So "my caves" is what `select * from humidors` returns,
 * for every caller, and a `.eq('user_id', …)` added here would double a policy
 * and outlive it (ADR 0004's rule, which ADR 0006 D4 inherits).
 *
 * The one place that difference will show is P3: the day `privacy.show_humidor`
 * opens a cave to a third party, these functions start returning someone else's
 * — correctly, and without a line changing here. A page that wants only its own
 * will then have to say so, which is what `listMyNotebook` already does and why
 * its comment distinguishes "what may be read" from "what this page is about".
 *
 * Lots and events are read from `humidor_inventory` rather than from
 * `humidor_items`: the view adds the three derivations of §5.5 that cannot be
 * columns, and being `security_invoker` it carries exactly the same RLS.
 */

const MAX_ROWS = 500

export type HumidorRow = {
  id: string
  name: string
  capacity: number | null
  target_rh: number | null
  target_temp: number | null
  is_default: boolean
  created_at: string
}

export type HumidorCigar = {
  id: string
  slug: string
  commercial_name: string
  brand: string | null
}

export type LotRow = {
  id: string
  humidor_id: string
  cigar_id: string
  qty: number
  purchase_date: string | null
  purchase_price_eur: number | null
  currency: string
  vendor_name: string | null
  box_code: string | null
  position: string | null
  aging_start_date: string | null
  notes: string | null
  aging_days: number | null
  stock_value_eur: number | null
  last_smoked_on: string | null
}

export type LotWithCigar = LotRow & { cigar: HumidorCigar | null }

export type LedgerRow = {
  id: string
  item_id: string
  type: HumidorEventType
  qty: number
  occurred_at: string
  review_id: string | null
  created_at: string
}

export type ReadingRow = {
  id: string
  rh: number | null
  temp_c: number | null
  recorded_at: string
  source: HumidorReadingSource
}

const LOT_COLUMNS =
  'id, humidor_id, cigar_id, qty, purchase_date, purchase_price_eur, currency, ' +
  'vendor_name, box_code, position, aging_start_date, notes, aging_days, ' +
  'stock_value_eur, last_smoked_on'

/**
 * The cigar behind each lot.
 *
 * Same shape and same reason as the notebook's `attachCigars`: PostgREST cannot
 * embed across schemas, and `humidor_items.cigar_id` points into `ref`. One
 * extra `in (…)` per page, never an N+1. A cigar that comes back missing was
 * unpublished after it was put away — the lot still shows, because a cave that
 * hides what it holds is worse than one naming a cigar it can no longer link to.
 */
async function attachCigars(rows: LotRow[]): Promise<Map<string, HumidorCigar>> {
  if (rows.length === 0) return new Map()

  const db = await referential()
  const { data } = await db
    .from('cigars')
    .select('id, slug, commercial_name, brands(name)')
    .in('id', [...new Set(rows.map((row) => row.cigar_id))])

  const list = (data ?? []) as unknown as {
    id: string
    slug: string
    commercial_name: string
    brands: { name: string } | null
  }[]

  return new Map(
    list.map((cigar) => [
      cigar.id,
      {
        id: cigar.id,
        slug: cigar.slug,
        commercial_name: cigar.commercial_name,
        brand: cigar.brands?.name ?? null,
      },
    ]),
  )
}

export async function listHumidors(): Promise<HumidorRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidors')
    .select('id, name, capacity, target_rh, target_temp, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Could not read the humidors: ${error.message}`)
  return (data ?? []) as HumidorRow[]
}

export async function getHumidor(id: string): Promise<HumidorRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('humidors')
    .select('id, name, capacity, target_rh, target_temp, is_default, created_at')
    .eq('id', id)
    .maybeSingle()

  return (data as HumidorRow | null) ?? null
}

/**
 * The lots of one cave, fullest first.
 *
 * Empty lots stay in the list. A line at zero is the trace of a box one has
 * finished, and it carries the ageing and the price one paid — deleting it to
 * tidy the view would erase the only record that it was ever there.
 */
export async function listLots(humidorId: string): Promise<LotWithCigar[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_inventory')
    .select(LOT_COLUMNS)
    .eq('humidor_id', humidorId)
    .order('qty', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the humidor: ${error.message}`)

  const rows = (data ?? []) as unknown as LotRow[]
  const cigars = await attachCigars(rows)
  return rows.map((row) => ({ ...row, cigar: cigars.get(row.cigar_id) ?? null }))
}

/** Every lot of every cave, for the summary and for the CSV export. */
export async function listAllLots(): Promise<LotWithCigar[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_inventory')
    .select(LOT_COLUMNS)
    .order('humidor_id', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the humidors: ${error.message}`)

  const rows = (data ?? []) as unknown as LotRow[]
  const cigars = await attachCigars(rows)
  return rows.map((row) => ({ ...row, cigar: cigars.get(row.cigar_id) ?? null }))
}

/**
 * What this member holds of one cigar, across every cave.
 *
 * Feeds the "j'en fume un" control on the cigar page. Returns the lots rather
 * than a total, because smoking draws from a *lot* — the one that names its age
 * and its price — and a total would leave the page unable to say which.
 */
export async function lotsForCigar(cigarId: string): Promise<LotWithCigar[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_inventory')
    .select(LOT_COLUMNS)
    .eq('cigar_id', cigarId)
    .gt('qty', 0)
    .order('aging_start_date', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Could not read the humidor: ${error.message}`)

  const rows = (data ?? []) as unknown as LotRow[]
  const cigars = await attachCigars(rows)
  return rows.map((row) => ({ ...row, cigar: cigars.get(row.cigar_id) ?? null }))
}

export async function listLedger(itemId: string): Promise<LedgerRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_events')
    .select('id, item_id, type, qty, occurred_at, review_id, created_at')
    .eq('item_id', itemId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the ledger: ${error.message}`)
  return (data ?? []) as LedgerRow[]
}

export async function listReadings(humidorId: string, limit = 20): Promise<ReadingRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_readings')
    .select('id, rh, temp_c, recorded_at, source')
    .eq('humidor_id', humidorId)
    .order('recorded_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Could not read the hygrometry: ${error.message}`)
  return (data ?? []) as ReadingRow[]
}

/**
 * Whether an entry has already been taken out of a cave.
 *
 * ADR 0006 D1 leaves the tasting path in two writes and pays for it with a
 * visible state instead of a guarantee. This is that state: the entry page asks
 * the question, and the answer decides between a button and a sentence.
 */
export async function smokeEventForReview(reviewId: string): Promise<LedgerRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('humidor_events')
    .select('id, item_id, type, qty, occurred_at, review_id, created_at')
    .eq('review_id', reviewId)
    .maybeSingle()

  return (data as LedgerRow | null) ?? null
}
