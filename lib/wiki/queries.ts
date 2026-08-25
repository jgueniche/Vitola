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

export type LineOption = { id: string; name: string }

/**
 * The lines a proposal may point at: **published**, and of this brand.
 *
 * `status = 'published'` here is a statement of what the field offers, not a
 * visibility filter doubling RLS — an editor's session can read drafts, and a
 * draft in the dropdown would let a proposal publish a line by referencing it.
 * The brand bound is the guard nothing in the schema holds: no constraint says
 * a line and a sheet share a brand, so the option list is where it starts.
 */
export async function listLineOptions(brandId: string): Promise<LineOption[]> {
  const db = await referential()
  const { data } = await db
    .from('lines')
    .select('id, name')
    .eq('brand_id', brandId)
    .eq('status', 'published')
    .order('name', { ascending: true })

  return (data ?? []) as LineOption[]
}

/**
 * Whether a proposed `line_id` may land on a sheet of this brand.
 *
 * Re-checked by the action on proposal **and** on apply, because the dropdown
 * is a convenience and a crafted form post is not bound by it. The published
 * bound matters on apply too: approving a proposal must not be the act that
 * effectively publishes a draft line by making a public sheet point at it.
 */
export async function lineIsProposable(lineId: string, brandId: string): Promise<boolean> {
  const db = await referential()
  const { data } = await db
    .from('lines')
    .select('id')
    .eq('id', lineId)
    .eq('brand_id', brandId)
    .eq('status', 'published')
    .maybeSingle()

  return data !== null
}

/**
 * Every line name the caller may read, for rendering a stored diff.
 *
 * No status filter: RLS decides. A member sees published names; an editor also
 * sees drafts, which is right for a reviewer reading an old proposal whose
 * line has since been withdrawn from publication.
 */
export async function listLineNames(): Promise<Map<string, string>> {
  const db = await referential()
  const { data } = await db.from('lines').select('id, name')
  return new Map(((data ?? []) as LineOption[]).map((line) => [line.id, line.name]))
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
  /* `brand_id` rides along without being proposable: the line check needs the
     sheet's brand, and `buildDiff` iterates the allowlist, so an extra key can
     never enter a diff. */
  const { data } = await db
    .from('cigars')
    .select(['brand_id', ...EDITABLE_COLUMNS].join(', '))
    .eq('id', cigarId)
    .maybeSingle()

  return (data as Record<string, unknown> | null) ?? null
}
