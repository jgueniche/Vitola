import { referential } from '@/lib/supabase/server'

import { EDITABLE_COLUMNS, readDiff, type Diff } from './model'

/**
 * Reads of the contribution queue (`ref.cigar_revisions`).
 *
 * Nothing here filters on the author or on a role, and that is the same rule as
 * everywhere else: two SELECT policies decide — `select_own` and
 * `select_editor` — so `listRevisions()` returns a member their own proposals
 * and an editor the whole queue, from one query. A `.eq('author_id', …)` added
 * "for safety" would make the reviewer's queue permanently empty, and it would
 * do so silently.
 *
 * The one place identity *is* named is `listMine()`, and its comment says why.
 */

const MAX_ROWS = 200

export type RevisionRow = {
  id: string
  cigar_id: string | null
  author_id: string
  diff: Diff
  comment: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
}

export type RevisionCigar = { id: string; slug: string; commercial_name: string }

export type RevisionWithCigar = RevisionRow & { cigar: RevisionCigar | null }

const COLUMNS =
  'id, cigar_id, author_id, diff, comment, status, reviewed_by, reviewed_at, ' +
  'review_comment, created_at'

function hydrate(rows: unknown[]): RevisionRow[] {
  return (rows as RevisionRow[]).map((row) => ({ ...row, diff: readDiff(row.diff) }))
}

async function attachCigars(rows: RevisionRow[]): Promise<Map<string, RevisionCigar>> {
  const ids = [...new Set(rows.map((row) => row.cigar_id).filter((id): id is string => id !== null))]
  if (ids.length === 0) return new Map()

  const db = await referential()
  const { data } = await db.from('cigars').select('id, slug, commercial_name').in('id', ids)

  return new Map(((data ?? []) as RevisionCigar[]).map((cigar) => [cigar.id, cigar]))
}

async function withCigars(rows: RevisionRow[]): Promise<RevisionWithCigar[]> {
  const cigars = await attachCigars(rows)
  return rows.map((row) => ({
    ...row,
    cigar: row.cigar_id ? (cigars.get(row.cigar_id) ?? null) : null,
  }))
}

/**
 * The queue, oldest first.
 *
 * Oldest first is the decision: a review queue sorted newest-first starves its
 * oldest item, and the oldest item is the contributor who has been waiting
 * longest. It is also what makes "combien en attente" mean something.
 */
export async function listPending(): Promise<RevisionWithCigar[]> {
  const db = await referential()
  const { data, error } = await db
    .from('cigar_revisions')
    .select(COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the queue: ${error.message}`)
  return withCigars(hydrate(data ?? []))
}

/**
 * What this member proposed, newest first.
 *
 * `author_id` is stated here and it is not the visibility filter the ADRs
 * forbid: it decides what the *page* is about. Without it an editor opening
 * "mes contributions" would find the whole site's, because their policy lets
 * them read it — the same distinction `listMyNotebook` draws.
 */
export async function listMine(userId: string): Promise<RevisionWithCigar[]> {
  const db = await referential()
  const { data, error } = await db
    .from('cigar_revisions')
    .select(COLUMNS)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the contributions: ${error.message}`)
  return withCigars(hydrate(data ?? []))
}

/** Every revision touching one sheet — the history of §F3, decisions included. */
export async function listForCigar(cigarId: string): Promise<RevisionRow[]> {
  const db = await referential()
  const { data, error } = await db
    .from('cigar_revisions')
    .select(COLUMNS)
    .eq('cigar_id', cigarId)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) throw new Error(`Could not read the history: ${error.message}`)
  return hydrate(data ?? [])
}

export async function getRevision(id: string): Promise<RevisionRow | null> {
  const db = await referential()
  const { data } = await db.from('cigar_revisions').select(COLUMNS).eq('id', id).maybeSingle()
  return data ? (hydrate([data])[0] ?? null) : null
}

export type VitolaOption = { id: string; name_salida: string; length_mm: number; ring_gauge: number }

/** The vitolas a proposal may point at. 51 rows, so all of them. */
export async function listVitolaOptions(): Promise<VitolaOption[]> {
  const db = await referential()
  const { data } = await db
    .from('vitolas')
    .select('id, name_salida, length_mm, ring_gauge')
    .order('name_salida', { ascending: true })

  return (data ?? []) as VitolaOption[]
}

/**
 * The sheet as the allowlist sees it: raw columns, no embeds.
 *
 * `getCigarBySlug()` returns the vitola *embedded*, which is what a page wants
 * and exactly what a diff cannot use — the column is `vitola_id`, and a diff
 * keyed on anything else could not be applied. Reading the row flat is the
 * difference between a proposal that writes and one that only renders.
 */
export async function currentValues(cigarId: string): Promise<Record<string, unknown> | null> {
  const db = await referential()
  const { data } = await db
    .from('cigars')
    .select(EDITABLE_COLUMNS.join(', '))
    .eq('id', cigarId)
    .maybeSingle()

  return (data as Record<string, unknown> | null) ?? null
}
