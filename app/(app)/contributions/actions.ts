'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import type { Database } from '@/lib/supabase/database.types'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  applyDiff,
  buildDiff,
  EDITABLE_COLUMNS,
  fieldFor,
  staleFields,
  type DiffValue,
} from '@/lib/wiki/model'
import { currentValues, getRevision, lineIsProposable } from '@/lib/wiki/queries'

/**
 * The four writes of the contribution queue (F3).
 *
 * Everything goes through the session client, so the seven policies of
 * `ref.cigar_revisions` decide and nothing here restates one. Three in
 * particular are load-bearing and would be wrong to copy:
 *
 *   - **a proposal is born pending** — `cigar_revisions_insert_own` requires
 *     `status = 'pending'` with no reviewer, so a member cannot self-approve and
 *     this file never checks for it;
 *   - **only an editor decides** — `cigar_revisions_update_editor`, and
 *     `cigars_update_editor` for the sheet itself. A member calling
 *     `approveRevision` writes nothing at all, and gets the same refusal as
 *     anybody whose row simply is not there;
 *   - **the author may withdraw while pending, and only while pending** —
 *     `cigar_revisions_delete_own_pending`. A decided proposal is history.
 *
 * The judgement in this file is the **order of the two writes on approval**,
 * and it is the same reasoning as ADR 0006 D1 without the transaction: the
 * sheet is updated first because it is the substance, and the revision is
 * marked afterwards. A failure between them leaves an applied change on a
 * proposal that still reads "en attente" — visible, and re-approving is a
 * no-op because the diff has already landed. The reverse order would leave a
 * proposal marked approved over a sheet that never changed, which nobody would
 * ever notice.
 */

export type WikiState = { error?: string; done?: boolean; id?: string; stale?: string[] }

const copy = m.contributions.errors

/* -------------------------------------------------------------------------- */
/* Proposing                                                                   */
/* -------------------------------------------------------------------------- */

const YEAR_MIN = 1850
const YEAR_MAX = 2200

/**
 * Reads one submitted field according to its declared kind.
 *
 * Returns `undefined` for a field the form did not send, which `buildDiff`
 * treats as "not touched" — different from `null`, which is "emptied". A form
 * that omitted a field it did not render must not propose clearing it.
 */
function readField(formData: FormData, column: string): DiffValue | undefined {
  /* `fieldFor()` and not a `.find()` on the const list: the literal list narrows
     each entry to its own shape, so `field.maxLength` would not exist on the
     members that have none. The declared type is the one this code wants. */
  const field = fieldFor(column)
  if (!field) return undefined
  if (!formData.has(column) && field.kind !== 'countryList') return undefined

  if (field.kind === 'countryList') {
    const raw = formData.get(column)
    if (raw === null) return undefined
    const list = String(raw)
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item !== '')
    return list.length === 0 ? null : list
  }

  /* A `<select multiple>` sends one value per choice and nothing at all when
     none is chosen — which is why the form also carries a hidden empty field
     under the same name: "sent, and empty" is a profile cleared, "not sent"
     would be a field never rendered. */
  if (field.kind === 'aromas') {
    const list = formData
      .getAll(column)
      .map((item) => String(item).trim())
      .filter((item) => item !== '')
    return list.length === 0 ? null : list
  }

  const raw = String(formData.get(column) ?? '').trim()
  if (raw === '') return null

  switch (field.kind) {
    case 'year': {
      const value = Number.parseInt(raw, 10)
      return Number.isInteger(value) ? value : null
    }
    case 'country':
      return raw.toUpperCase()
    default:
      return raw
  }
}

/** The shape checks the CHECK constraints would otherwise report as 23514. */
function validate(submitted: Record<string, DiffValue>): string | null {
  for (const column of EDITABLE_COLUMNS) {
    const field = fieldFor(column)
    const value = submitted[column]
    if (!field || value === undefined || value === null) continue

    if (field.kind === 'country' && !/^[A-Z]{2}$/.test(String(value))) {
      return copy.countryFormat
    }
    if (field.kind === 'countryList') {
      const list = Array.isArray(value) ? value : [String(value)]
      if (list.some((item) => !/^[A-Z]{2}$/.test(item))) return copy.countryFormat
      if (list.length > 12) return copy.tooManyOrigins
    }
    if (field.kind === 'year') {
      const year = Number(value)
      if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) return copy.yearRange
    }
    if (field.kind === 'aromas') {
      const list = Array.isArray(value) ? value : [String(value)]
      if (list.length > 12) return copy.tooManyAromas
      if (list.some((item) => !/^[0-9]{1,9}$/.test(item))) return copy.unknownAroma
    }
    if (field.kind === 'enum' && !field.values?.includes(String(value))) {
      return copy.unknown
    }
    if (
      (field.kind === 'vitola' || field.kind === 'line') &&
      !z.uuid().safeParse(String(value)).success
    ) {
      return copy.unknown
    }
    if (field.maxLength && String(value).length > field.maxLength) {
      return copy.tooLong
    }
  }
  return null
}

const proposeSchema = z.object({
  cigarId: z.uuid(),
  slug: z.string().min(1),
  comment: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(1000, copy.commentTooLong))
      .nullable(),
  ),
})

export async function proposeRevision(
  _previous: WikiState,
  formData: FormData,
): Promise<WikiState> {
  const parsed = proposeSchema.safeParse({
    cigarId: formData.get('cigarId'),
    slug: formData.get('slug'),
    comment: formData.get('comment'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const current = await currentValues(parsed.data.cigarId)
  if (!current) return { error: copy.sheetGone }

  const submitted: Record<string, DiffValue> = {}
  for (const column of EDITABLE_COLUMNS) {
    const value = readField(formData, column)
    if (value !== undefined) submitted[column] = value
  }

  const invalid = validate(submitted)
  if (invalid) return { error: invalid }

  const diff = buildDiff(current, submitted)
  /* The empty proposal, refused here rather than by
     `cigar_revisions_diff_not_empty`: the constraint says 23514, which is not a
     sentence, and "vous n'avez rien changé" is the whole of what happened. */
  if (Object.keys(diff).length === 0) return { error: copy.nothingChanged }

  /* A line must be published and of this sheet's brand. The dropdown already
     enforces both, but a form post is not bound by a dropdown, and no database
     constraint holds either half — ADR 0009. */
  const lineRefused = await refuseForeignLine(diff.line_id?.to, current.brand_id)
  if (lineRefused) return { error: lineRefused }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { data, error } = await supabase
    .schema('ref')
    .from('cigar_revisions')
    .insert({
      cigar_id: parsed.data.cigarId,
      author_id: session.user.id,
      diff,
      comment: parsed.data.comment,
    })
    .select('id')
    .single()

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.contributions())
  revalidatePath(routes.cigarHistory(parsed.data.slug))
  return { done: true, id: data.id }
}

/** The author takes back a proposal nobody has decided on yet. */
export async function withdrawRevision(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.schema('ref').from('cigar_revisions').delete().eq('id', parsed.data.id)

  revalidatePath(routes.contributions())
}

/* -------------------------------------------------------------------------- */
/* Deciding                                                                    */
/* -------------------------------------------------------------------------- */

const decideSchema = z.object({
  id: z.uuid(),
  comment: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(1000, copy.commentTooLong))
      .nullable(),
  ),
})

/**
 * Applies a proposal to the sheet, then records the decision.
 *
 * The staleness check is the one guard a wiki genuinely needs. Two people
 * correct the same field; the first is approved; approving the second on top of
 * it would silently revert a change nobody meant to revert. Comparing each
 * `from` against the sheet as it stands costs one read and turns that into a
 * refusal the reviewer can act on — the field names come back in `stale`.
 *
 * It compares only the fields the proposal touches. A sheet whose *other*
 * columns moved is not stale for this proposal.
 */
export async function approveRevision(
  _previous: WikiState,
  formData: FormData,
): Promise<WikiState> {
  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const revision = await getRevision(parsed.data.id)
  if (!revision) return { error: copy.notFound }
  if (revision.status !== 'pending') return { error: copy.alreadyDecided }
  if (!revision.cigar_id) return { error: copy.newSheetUnsupported }

  const current = await currentValues(revision.cigar_id)
  if (!current) return { error: copy.sheetGone }

  const stale = staleFields(revision.diff, current)
  if (stale.length > 0) return { error: copy.stale, stale }

  /* Re-checked on apply, not only on proposal: the line may have been
     unpublished since, and approving must not be the act that republishes it
     through a public sheet. */
  const lineRefused = await refuseForeignLine(revision.diff.line_id?.to, current.brand_id)
  if (lineRefused) return { error: lineRefused }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  /*
   * 1. The substance. `cigars_update_editor` decides whether this lands.
   *
   * The cast is the one place in this file where the generated per-column types
   * are traded for a dynamic patch, and it is safe for a stated reason:
   * `applyDiff()` keeps only columns present in `EDITABLE_COLUMNS`, which is
   * itself a subset of the UPDATE grant. A column the allowlist does not name
   * cannot reach here, whatever a stored diff contains — `readDiff()` drops it
   * on the way out of the database as well as on the way in.
   */
  const values: Record<string, unknown> = applyDiff(revision.diff)
  /* The one column whose stored shape is not its column type: a diff keeps
     descriptor ids as strings like every list, the column is integer[] and
     NOT NULL — so "cleared" is an empty array, never a null. The trigger of
     0025 still decides whether each id is a descriptor; this only restores
     the type the JSON lost. */
  if ('aroma_tags' in values) {
    const list = values.aroma_tags
    values.aroma_tags = Array.isArray(list) ? list.map(Number) : []
  }
  const patch = values as Database['ref']['Tables']['cigars']['Update']

  const { data: updated, error: updateError } = await supabase
    .schema('ref')
    .from('cigars')
    .update(patch)
    .eq('id', revision.cigar_id)
    .select('id, slug')

  if (updateError) return { error: refusalMessage(updateError.code) }
  /* Zero rows is a policy declining, which for this table means "you are not an
     editor". It does not raise, so reading the result is the only way to tell
     it from success — and marking the revision approved after it would be the
     worst of both. */
  if (!updated || updated.length === 0) return { error: copy.notEditor }

  // 2. The record of the decision.
  const { error: decideError } = await supabase
    .schema('ref')
    .from('cigar_revisions')
    .update({
      status: 'approved',
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      review_comment: parsed.data.comment,
    })
    .eq('id', parsed.data.id)

  if (decideError) return { error: refusalMessage(decideError.code) }

  revalidatePath(routes.contributions())
  const slug = updated[0]?.slug
  if (slug) {
    revalidatePath(routes.cigar(slug))
    revalidatePath(routes.cigarHistory(slug))
  }

  /*
   * A decision navigates rather than returning a confirmation, and the reason
   * is that the confirmation had nowhere to appear: approving removes the
   * proposal from the queue, so the form holding the returned state unmounts in
   * the same render. Measured in a browser — the write landed and the reviewer
   * saw nothing at all.
   *
   * The outcome goes in the URL, which is where this codebase keeps interface
   * state anyway: it survives the revalidation, it is back-button correct, and
   * the banner can name what happened.
   */
  redirect(`${routes.contributions()}?decidee=approuvee`)
}

export async function rejectRevision(_previous: WikiState, formData: FormData): Promise<WikiState> {
  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    comment: formData.get('comment'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  /* A rejection without a reason is a door closed in somebody's face. The
     constraint does not require one; this does, because the contributor is the
     only person who cannot see why. */
  if (!parsed.data.comment) return { error: copy.rejectionNeedsReason }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { data, error } = await supabase
    .schema('ref')
    .from('cigar_revisions')
    .update({
      status: 'rejected',
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      review_comment: parsed.data.comment,
    })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  if (!data || data.length === 0) return { error: copy.notEditor }

  revalidatePath(routes.contributions())
  redirect(`${routes.contributions()}?decidee=refusee`)
}

/** Null when the proposed line may land; the refusal sentence otherwise. */
async function refuseForeignLine(
  proposed: DiffValue | undefined,
  brandId: unknown,
): Promise<string | null> {
  if (proposed === undefined || proposed === null) return null
  if (typeof brandId !== 'string') return copy.lineUnknown
  return (await lineIsProposable(String(proposed), brandId)) ? null : copy.lineUnknown
}

function refusalMessage(code: string | undefined): string {
  if (code === '42501') return copy.notEditor
  if (code === '23514') return copy.constraint
  /* The aroma guard of 0025 raises a foreign-key code for an id the wheel does not know. */
  if (code === '23503') return copy.unknownAroma
  if (code === '23505') return copy.duplicate
  return copy.unknown
}
