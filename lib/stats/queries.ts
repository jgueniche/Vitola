import { referential, createSupabaseServerClient } from '@/lib/supabase/server'

import type { ReviewKind } from '@/lib/reviews/model'

/**
 * The numbers of F11 (§9 puts statistics at the end of P2).
 *
 * Two sources, and the difference between them is the whole point of reading
 * both: the **notebook** knows what one thought, the **ledger** knows what one
 * smoked. They do not agree, and neither is wrong — ADR 0006 D2 lets a member
 * smoke from their cave without writing anything, so the ledger legitimately
 * counts cigars the notebook has never heard of.
 *
 * Both are read under the member's own RLS. `user_id` is stated on the notebook
 * read for the reason `listMyNotebook` documents — it decides what the page is
 * *about*, not what may be read, and without it a moderator would open their
 * statistics and find the site's. The ledger needs no such filter: its policy
 * already reaches `humidors.user_id` through two `EXISTS`.
 */

/**
 * The cap, and it is deliberately visible.
 *
 * Aggregating in the database would avoid it, but a `group by` through PostgREST
 * means either an RPC per figure or turning on aggregate functions, and both are
 * a bigger decision than this page is worth today. Five thousand entries is far
 * beyond any plausible v1 notebook; the page says so when it is reached, because
 * a silent truncation reads exactly like a complete answer.
 */
export const STATS_MAX = 5000

export type StatsEntry = {
  id: string
  kind: ReviewKind
  score_total: number | null
  smoked_on: string
  cigar_id: string
}

export type SmokeCount = { occurred_at: string; qty: number }

export type StatsBundle = {
  entries: StatsEntry[]
  truncated: boolean
  smokes: SmokeCount[]
  stockQty: number
  stockValue: number | null
  cigarNames: Map<string, string>
}

export async function collectStats(userId: string): Promise<StatsBundle> {
  const supabase = await createSupabaseServerClient()

  const [entriesResult, smokesResult, stockResult] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, kind, score_total, smoked_on, cigar_id')
      .eq('user_id', userId)
      .order('smoked_on', { ascending: false })
      .limit(STATS_MAX),
    supabase
      .from('humidor_events')
      .select('occurred_at, qty')
      .eq('type', 'smoke')
      .order('occurred_at', { ascending: false })
      .limit(STATS_MAX),
    supabase.from('humidor_inventory').select('qty, stock_value_eur').limit(STATS_MAX),
  ])

  if (entriesResult.error) {
    throw new Error(`Could not read the notebook: ${entriesResult.error.message}`)
  }
  if (smokesResult.error) {
    throw new Error(`Could not read the ledger: ${smokesResult.error.message}`)
  }

  const entries = (entriesResult.data ?? []) as StatsEntry[]
  const smokes = (smokesResult.data ?? []) as SmokeCount[]
  const stock = (stockResult.data ?? []) as { qty: number | null; stock_value_eur: number | null }[]

  const stockQty = stock.reduce((sum, row) => sum + (row.qty ?? 0), 0)
  const priced = stock.some((row) => row.stock_value_eur !== null)
  const stockValue = priced
    ? stock.reduce((sum, row) => sum + (row.stock_value_eur ?? 0), 0)
    : null

  return {
    entries,
    truncated: entries.length === STATS_MAX,
    smokes,
    stockQty,
    stockValue,
    cigarNames: await namesFor(entries.map((entry) => entry.cigar_id)),
  }
}

/**
 * Names for the cigars that appear in the ranking.
 *
 * One `in (…)` across the whole page rather than one per row: `reviews.cigar_id`
 * crosses into `ref`, which PostgREST cannot embed, so this is the same fixed
 * second round trip the notebook already pays.
 */
async function namesFor(cigarIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(cigarIds)]
  if (unique.length === 0) return new Map()

  const db = await referential()
  const { data } = await db.from('cigars').select('id, commercial_name').in('id', unique)

  return new Map((data ?? []).map((cigar) => [cigar.id, cigar.commercial_name]))
}

/* -------------------------------------------------------------------------- */
/* Pure shaping — no database below this line                                  */
/* -------------------------------------------------------------------------- */

export type MonthBucket = { month: string; count: number }

/**
 * The last twelve months, including the empty ones.
 *
 * Empty months are kept on purpose: a rhythm is a shape, and a chart that skips
 * the months one did not smoke draws a straight line through a pause. `anchor`
 * is passed in so the function stays testable — a bucket list that depends on
 * `new Date()` can only be asserted against itself.
 */
export function monthlyBuckets(dates: string[], anchor: Date): MonthBucket[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const month = date.slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }

  const buckets: MonthBucket[] = []
  for (let back = 11; back >= 0; back -= 1) {
    const cursor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - back, 1))
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    buckets.push({ month, count: counts.get(month) ?? 0 })
  }
  return buckets
}

/** The mean of the entries that carry a score, or null when none does. */
export function meanScore(scores: (number | null)[]): number | null {
  const given = scores.filter((score): score is number => score !== null)
  if (given.length === 0) return null
  return given.reduce((sum, score) => sum + score, 0) / given.length
}

export type RankedCigar = { cigarId: string; count: number }

/**
 * The cigars one comes back to, most first.
 *
 * A single entry is not a habit, so singletons are dropped: a "top" made of
 * fifteen cigars smoked once each says nothing that the entry count did not.
 */
export function rankCigars(cigarIds: string[], limit = 5): RankedCigar[] {
  const counts = new Map<string, number>()
  for (const id of cigarIds) counts.set(id, (counts.get(id) ?? 0) + 1)

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cigarId, count]) => ({ cigarId, count }))
}
