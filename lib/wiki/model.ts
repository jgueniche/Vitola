/**
 * What a contributor may propose, and what a diff is.
 *
 * This file is the single source for three things that must never disagree:
 * the fields the proposal form offers, the way a stored diff is rendered, and
 * the way an approved diff is applied. Written three times, they drift, and the
 * drift is silent — a field offered but not applied looks like a reviewer who
 * ignored you.
 *
 * `EDITABLE_FIELDS` is an **allowlist**, and everything absent from it is
 * absent on purpose:
 *
 *   - `slug` — changing it breaks every URL anybody saved, including the ones
 *     in someone's notebook entries. It is a rename, not a correction.
 *   - `status`, `verified_at`, `verified_by`, `merged_into_id` — editorial acts,
 *     not facts about a cigar. They belong to whoever runs the referential.
 *   - `msrp_eur` and its two companions — the price comes from a published
 *     decree (arrêté du 5 août 2026), not from anybody's memory, and the schema
 *     refuses a price without a source and a date. A contributor correcting a
 *     price from recollection would be replacing a legal figure with a guess.
 *   - `brand_id` and `line_id` — a sheet that changes brand is a different
 *     sheet, and `ref.lines` is deliberately empty in v1 (see CLAUDE.md).
 *
 * `vitola_id` **is** in the list, and it is the most valuable thing here: 862
 * of the 940 seeded sheets have no vitola, which is the referential's largest
 * hole and exactly the kind of fact a contributor knows and a reviewer checks.
 */

import { Constants } from '@/lib/supabase/database.types'

export type FieldKind = 'text' | 'enum' | 'country' | 'countryList' | 'year' | 'vitola'

export type EditableField = {
  /** The column, which is also the diff key. */
  column: string
  kind: FieldKind
  /** For `enum`, the allowed values, straight from the generated types. */
  values?: readonly string[]
  maxLength?: number
}

export const EDITABLE_FIELDS = [
  { column: 'commercial_name', kind: 'text', maxLength: 120 },
  { column: 'vitola_id', kind: 'vitola' },
  { column: 'origin_country', kind: 'country' },
  { column: 'wrapper_origin', kind: 'country' },
  { column: 'binder_origin', kind: 'country' },
  { column: 'filler_origins', kind: 'countryList' },
  { column: 'wrapper_shade', kind: 'enum', values: Constants.ref.Enums.wrapper_shade },
  { column: 'strength', kind: 'enum', values: Constants.ref.Enums.strength },
  { column: 'release_type', kind: 'enum', values: Constants.ref.Enums.release_type },
  { column: 'release_year', kind: 'year' },
  { column: 'discontinued_year', kind: 'year' },
] as const satisfies readonly EditableField[]

export type EditableColumn = (typeof EDITABLE_FIELDS)[number]['column']

export const EDITABLE_COLUMNS: readonly string[] = EDITABLE_FIELDS.map((field) => field.column)

export function fieldFor(column: string): EditableField | undefined {
  return EDITABLE_FIELDS.find((field) => field.column === column)
}

/* -------------------------------------------------------------------------- */
/* Diffs                                                                       */
/* -------------------------------------------------------------------------- */

export type DiffValue = string | number | string[] | null

/**
 * A proposal, stored in `ref.cigar_revisions.diff`.
 *
 * `{ column: { from, to } }` rather than `{ column: to }`, and the `from` is
 * what makes the history readable a year later: a diff that only carries the
 * new value cannot be rendered as a change once the sheet has moved on, and a
 * reviewer approving it cannot see what they are overwriting.
 *
 * It also gives the one guard a wiki actually needs — see `isStale()`.
 */
export type DiffEntry = { from: DiffValue; to: DiffValue }
export type Diff = Record<string, DiffEntry>

/** Normalises a column value so two spellings of "nothing" compare equal. */
export function normalise(value: unknown): DiffValue {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    const list = value.map(String).filter((item) => item !== '')
    return list.length === 0 ? null : list
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  return text === '' ? null : text
}

export function sameValue(a: DiffValue, b: DiffValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : a === null ? [] : [String(a)]
    const right = Array.isArray(b) ? b : b === null ? [] : [String(b)]
    return left.length === right.length && left.every((item, index) => item === right[index])
  }
  return a === b
}

/**
 * Builds a diff from what the sheet holds and what was submitted.
 *
 * Only changed fields go in, which is why an untouched form produces `{}` and
 * `cigar_revisions_diff_not_empty` refuses it — the constraint is the one that
 * stops a queue filling with proposals that propose nothing.
 */
export function buildDiff(
  current: Record<string, unknown>,
  submitted: Record<string, DiffValue>,
): Diff {
  const diff: Diff = {}

  for (const column of EDITABLE_COLUMNS) {
    if (!(column in submitted)) continue
    const from = normalise(current[column])
    const to = normalise(submitted[column])
    if (!sameValue(from, to)) diff[column] = { from, to }
  }

  return diff
}

/**
 * Whether the sheet moved under a pending proposal.
 *
 * The wiki's one real hazard: two people correct the same field, the first is
 * approved, and the second is then approved on top of it — silently reverting a
 * change nobody meant to revert. Comparing each `from` against the sheet as it
 * stands now costs nothing and turns that into a visible refusal.
 *
 * It compares only the fields the proposal touches. A sheet whose *other*
 * fields changed is not stale for this proposal, and refusing it would make the
 * queue unusable on a busy sheet.
 */
export function staleFields(diff: Diff, current: Record<string, unknown>): string[] {
  return Object.entries(diff)
    .filter(([column, entry]) => !sameValue(normalise(current[column]), entry.from))
    .map(([column]) => column)
}

/** The row an approved diff writes. Values only — the `from` half is history. */
export function applyDiff(diff: Diff): Record<string, DiffValue> {
  const patch: Record<string, DiffValue> = {}
  for (const [column, entry] of Object.entries(diff)) {
    if (EDITABLE_COLUMNS.includes(column)) patch[column] = entry.to
  }
  return patch
}

/**
 * Reads a stored diff back, dropping anything not on the allowlist.
 *
 * A row written when the allowlist was wider — or by hand — must not be able to
 * apply a column the current code refuses to offer. The allowlist is checked on
 * the way out as well as on the way in, because the two happen months apart.
 */
export function readDiff(value: unknown): Diff {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const diff: Diff = {}

  for (const [column, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!EDITABLE_COLUMNS.includes(column)) continue
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const { from, to } = entry as { from?: unknown; to?: unknown }
    diff[column] = { from: normalise(from), to: normalise(to) }
  }

  return diff
}
