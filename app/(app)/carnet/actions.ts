'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { refreshCigarStats } from '@/app/api/_stats/refresh'
import { m } from '@/lib/i18n'
import {
  affectsPublicAverage,
  compactScores,
  REVIEW_LIMITS,
  REVIEW_SCOPES,
  SCORE_KEYS,
  SUB_SCORE_MAX,
  totalFromScores,
  type ReviewVisibility,
  type Scores,
} from '@/lib/reviews/model'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write of the notebook (ADR 0004).
 *
 * All of them go through the session client, so RLS decides and nothing here
 * restates a policy. The rules that matter live in migration 0003 and each
 * would be wrong to copy:
 *
 *   - **Whose entry it is** — `user_id = auth.uid()` on insert, update and
 *     delete. A member cannot write into someone else's notebook, and this file
 *     never has to check.
 *   - **What may be noted** — an `EXISTS` on `ref.cigars` inside the insert
 *     policy, itself subject to that table's RLS, so a draft entry cannot be
 *     rated without this file knowing what a draft is.
 *   - **Who may be named** — `review_shares_insert_author` requires both
 *     `granted_by = auth.uid()` and `owns_review(review_id)`. A recipient
 *     therefore cannot re-share, which ADR 0004 forbids and this file never
 *     mentions.
 *
 * What IS restated is shape: lengths, ranges, the six score keys. A CHECK
 * refuses in `23514`, which is not a sentence anybody should read. That
 * duplication costs a clumsy message when it drifts; duplicating a *visibility*
 * rule would cost a reader who should not have been one, which is why the
 * queries do not.
 *
 * The one refusal worth naming is `42501` — a policy declining, not a fault.
 */

export type EntryState = { error?: string; done?: boolean; id?: string }

/* -------------------------------------------------------------------------- */
/* Shared field schemas                                                        */
/* -------------------------------------------------------------------------- */

const visibilitySchema = z.enum(REVIEW_SCOPES)

/** '' from an untouched optional input means "not filled", never 0 or NaN. */
const blank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

const optionalText = (max: number, message: string) =>
  z.preprocess(
    blank,
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(max, message))
      .nullable(),
  )

const optionalNumber = (min: number, max: number, message: string) =>
  z.preprocess(blank, z.coerce.number().min(min, message).max(max, message).nullable())

const optionalInteger = (min: number, max: number, message: string) =>
  z.preprocess(blank, z.coerce.number().int(message).min(min, message).max(max, message).nullable())

/**
 * `smoked_on` is the day one smoked, which the schema separates from
 * `created_at` because "on note souvent le lendemain".
 *
 * The future is refused, with a day of slack. A member in Auckland filling this
 * in on their Tuesday evening is on the server's Monday, and blocking them
 * would be a bug reported as "it refuses today's date". One day is enough for
 * every offset on earth and still refuses next month.
 */
const smokedOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, m.notebook.errors.dateInvalid)
  .refine((value) => !Number.isNaN(Date.parse(value)), m.notebook.errors.dateInvalid)
  .refine((value) => {
    const limit = new Date()
    limit.setUTCDate(limit.getUTCDate() + 1)
    return Date.parse(value) <= limit.getTime()
  }, m.notebook.errors.dateFuture)

const scoreSchema = optionalNumber(
  REVIEW_LIMITS.scoreMin,
  REVIEW_LIMITS.scoreMax,
  m.notebook.errors.scoreRange,
)

const bodySchema = optionalText(REVIEW_LIMITS.bodyMax, m.notebook.errors.bodyTooLong)

/* -------------------------------------------------------------------------- */
/* The daily gesture — kind = 'log'                                            */
/* -------------------------------------------------------------------------- */

const logSchema = z
  .object({
    cigarId: z.uuid(),
    slug: z.string().min(1),
    smokedOn: smokedOnSchema,
    scoreTotal: scoreSchema,
    body: bodySchema,
    visibility: visibilitySchema,
  })
  /*
   * `reviews_log_says_something`, restated so the refusal is a sentence.
   * Without it the constraint fires as 23514 and the member is told nothing
   * about which of the two fields would have satisfied it.
   */
  .refine((value) => value.scoreTotal !== null || (value.body ?? '') !== '', {
    message: m.notebook.errors.emptyLog,
    path: ['body'],
  })

export async function saveLogEntry(
  _previous: EntryState,
  formData: FormData,
): Promise<EntryState> {
  const parsed = logSchema.safeParse({
    cigarId: formData.get('cigarId'),
    slug: formData.get('slug'),
    smokedOn: formData.get('smokedOn'),
    scoreTotal: formData.get('scoreTotal'),
    body: formData.get('body'),
    visibility: formData.get('visibility'),
  })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: m.notebook.errors.notAllowed }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      user_id: session.user.id,
      cigar_id: parsed.data.cigarId,
      kind: 'log',
      visibility: parsed.data.visibility,
      score_total: parsed.data.scoreTotal,
      body: parsed.data.body,
      smoked_on: parsed.data.smokedOn,
    })
    .select('id')
    .single()

  if (error) return { error: refusalMessage(error.code) }

  await settle(parsed.data.slug, null, parsed.data.visibility)
  return { done: true, id: data.id }
}

/* -------------------------------------------------------------------------- */
/* The exercise — kind = 'tasting'                                             */
/* -------------------------------------------------------------------------- */

const subScoreSchema = optionalNumber(0, SUB_SCORE_MAX, m.notebook.errors.subScoreRange)

const tastingSchema = z.object({
  cigarId: z.uuid(),
  slug: z.string().min(1),
  smokedOn: smokedOnSchema,
  visibility: visibilitySchema,
  isBlind: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
  strength: z.preprocess(
    blank,
    z.enum(['leger', 'leger_moyen', 'moyen', 'moyen_corse', 'corse']).nullable(),
  ),
  duration: optionalInteger(
    REVIEW_LIMITS.durationMin,
    REVIEW_LIMITS.durationMax,
    m.notebook.errors.durationRange,
  ),
  humidity: optionalNumber(
    REVIEW_LIMITS.humidityMin,
    REVIEW_LIMITS.humidityMax,
    m.notebook.errors.humidityRange,
  ),
  productionYear: optionalInteger(
    REVIEW_LIMITS.yearMin,
    REVIEW_LIMITS.yearMax,
    m.notebook.errors.yearRange,
  ),
  purchaseYear: optionalInteger(
    REVIEW_LIMITS.yearMin,
    REVIEW_LIMITS.yearMax,
    m.notebook.errors.yearRange,
  ),
  boxCode: optionalText(REVIEW_LIMITS.boxCodeMax, m.notebook.errors.boxCodeTooLong),
  pairingText: optionalText(REVIEW_LIMITS.pairingTextMax, m.notebook.errors.pairingTooLong),
  body: bodySchema,
  aromaTags: z.array(z.coerce.number().int()).max(
    REVIEW_LIMITS.aromaTagsMax,
    m.notebook.errors.aromaTooMany,
  ),
  thirds: z.array(optionalText(REVIEW_LIMITS.thirdNotesMax, m.notebook.errors.thirdTooLong)).length(3),
  scores: z.record(z.string(), subScoreSchema),
})

/**
 * A structured tasting, with its thirds.
 *
 * The total is computed, never read from the form: `totalFromScores()` is the
 * whole difference between the exercise and the gesture, and a field that could
 * override it would turn the six criteria into decoration. A partial set of six
 * is refused here rather than by `reviews_tasting_has_structure`, which only
 * requires `scores <> '{}'` — the constraint accepts one criterion out of six,
 * and one criterion out of six is not a tasting.
 *
 * Takes a bare `FormData`, unlike `saveLogEntry` above: the tasting form calls
 * it from a `useTransition` so it can clear its local draft and navigate to the
 * saved entry in the same place it learns of the success. React's lint rule
 * forbids `setState` in an effect, and watching a returned state in order to
 * redirect is precisely what an effect would have been used for.
 *
 * The thirds are written after the entry and cannot be written before it: they
 * are keyed by `review_id`. A failure between the two leaves a tasting without
 * its thirds, which is a legible half-result — the entry exists, carries its
 * scores, and the thirds can be typed again. The alternative would be a
 * transaction, which PostgREST does not offer across two tables.
 */
export async function saveTasting(formData: FormData): Promise<EntryState> {
  const scores: Record<string, FormDataEntryValue | null> = {}
  for (const key of SCORE_KEYS) scores[key] = formData.get(`score_${key}`)

  const parsed = tastingSchema.safeParse({
    cigarId: formData.get('cigarId'),
    slug: formData.get('slug'),
    smokedOn: formData.get('smokedOn'),
    visibility: formData.get('visibility'),
    isBlind: formData.get('isBlind'),
    strength: formData.get('strength'),
    duration: formData.get('duration'),
    humidity: formData.get('humidity'),
    productionYear: formData.get('productionYear'),
    purchaseYear: formData.get('purchaseYear'),
    boxCode: formData.get('boxCode'),
    pairingText: formData.get('pairingText'),
    body: formData.get('body'),
    aromaTags: formData.getAll('aromaTags'),
    thirds: [formData.get('third_1'), formData.get('third_2'), formData.get('third_3')],
    scores,
  })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const filled = compactScores(parsed.data.scores as Scores)
  const total = totalFromScores(filled)
  if (total === null) return { error: m.notebook.errors.tastingIncomplete }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: m.notebook.errors.notAllowed }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      user_id: session.user.id,
      cigar_id: parsed.data.cigarId,
      kind: 'tasting',
      visibility: parsed.data.visibility,
      score_total: total,
      scores: filled,
      aroma_tags: parsed.data.aromaTags,
      strength_perceived: parsed.data.strength,
      smoke_duration_min: parsed.data.duration,
      humidity_pct: parsed.data.humidity,
      production_year: parsed.data.productionYear,
      purchase_year: parsed.data.purchaseYear,
      box_code: parsed.data.boxCode,
      pairing_text: parsed.data.pairingText,
      body: parsed.data.body,
      is_blind: parsed.data.isBlind,
      smoked_on: parsed.data.smokedOn,
    })
    .select('id')
    .single()

  if (error) return { error: refusalMessage(error.code) }

  const thirds = parsed.data.thirds
    .map((notes, index) => ({ review_id: data.id, third: index + 1, notes }))
    .filter((row) => (row.notes ?? '') !== '')

  if (thirds.length > 0) {
    const { error: thirdsError } = await supabase.from('review_thirds').insert(thirds)
    if (thirdsError) return { error: refusalMessage(thirdsError.code), id: data.id }
  }

  await settle(parsed.data.slug, null, parsed.data.visibility)
  return { done: true, id: data.id }
}

/* -------------------------------------------------------------------------- */
/* Editing an existing entry                                                   */
/* -------------------------------------------------------------------------- */

const editSchema = z
  .object({
    id: z.uuid(),
    smokedOn: smokedOnSchema,
    scoreTotal: scoreSchema,
    body: bodySchema,
    visibility: visibilitySchema,
  })
  .refine((value) => value.scoreTotal !== null || (value.body ?? '') !== '', {
    message: m.notebook.errors.emptyLog,
    path: ['body'],
  })

/**
 * Edits the fields a notebook entry can change after the fact.
 *
 * `user_id` and `cigar_id` are absent from every UPDATE grant, so an entry
 * changes neither author nor cigar — getting the wrong cigar means deleting and
 * retyping, which is visible, rather than a silent slide through the statistics.
 * A tasting's six scores are not edited here either: re-scoring an exercise is
 * doing it again.
 *
 * Takes the previous state because the editor drives it with `useActionState`:
 * unlike the tasting form it stays where it is on success, so it has a refusal
 * to show back and nothing to navigate to.
 */
export async function editEntry(_previous: EntryState, formData: FormData): Promise<EntryState> {
  const parsed = editSchema.safeParse({
    id: formData.get('id'),
    smokedOn: formData.get('smokedOn'),
    scoreTotal: formData.get('scoreTotal'),
    body: formData.get('body'),
    visibility: formData.get('visibility'),
  })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const before = await visibilityOf(parsed.data.id)

  const { data, error } = await supabase
    .from('reviews')
    /* `updated_at` is absent on purpose: `reviews_set_updated_at` stamps it,
       and writing it by hand would let a clock skew between the web server and
       the database decide whether an entry reads as "modifié". */
    .update({
      score_total: parsed.data.scoreTotal,
      body: parsed.data.body,
      smoked_on: parsed.data.smokedOn,
      visibility: parsed.data.visibility,
    })
    .eq('id', parsed.data.id)
    .select('id, cigar_id')

  if (error) return { error: refusalMessage(error.code) }

  /*
   * An UPDATE a policy refuses does not error — it matches no row and reports
   * nothing. Treating that as success would show a confirmation over an
   * unchanged entry: nothing saved, and nothing said. Same trap as assertion T8
   * of the Phase 0 verification file, green for two months over a row it had
   * never inserted.
   */
  const updated = data?.[0]
  if (!updated) return { error: m.notebook.errors.notAllowed }

  await settle(await slugOfCigar(updated.cigar_id), before, parsed.data.visibility)
  revalidatePath(routes.notebookEntry(parsed.data.id))
  return { done: true, id: parsed.data.id }
}

const deleteSchema = z.object({ id: z.uuid() })

export async function deleteEntry(formData: FormData): Promise<void> {
  const parsed = deleteSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const before = await visibilityOf(parsed.data.id)

  const { data } = await supabase
    .from('reviews')
    .delete()
    .eq('id', parsed.data.id)
    .select('cigar_id')

  const cigarId = data?.[0]?.cigar_id
  await settle(cigarId ? await slugOfCigar(cigarId) : null, before, null)

  redirect(routes.notebook())
}

/* -------------------------------------------------------------------------- */
/* Naming people — public.review_shares                                        */
/* -------------------------------------------------------------------------- */

const shareSchema = z.object({ reviewId: z.uuid(), granteeId: z.uuid() })

/**
 * Names one person on one entry.
 *
 * `granted_by` is the caller and the policy checks it: an entry's author is the
 * only one who may add a row, so a recipient cannot pass the sharing on. The
 * column is not bookkeeping — it is what makes "who opened this?" a question
 * with an answer.
 *
 * Sharing is per entry, never global. "Partager tout mon carnet avec Marc" is a
 * different feature and ADR 0004 sends it to its own ADR.
 *
 * Takes the previous state because naming somebody can be refused and the
 * refusal has to be readable — `23505` when the person is already named, `42501`
 * when the policy declines. `removeShare` below needs none of that: a withdrawal
 * that worked is visible by the row being gone.
 */
export async function addShare(_previous: EntryState, formData: FormData): Promise<EntryState> {
  const parsed = shareSchema.safeParse({
    reviewId: formData.get('reviewId'),
    granteeId: formData.get('granteeId'),
  })

  if (!parsed.success) return { error: m.notebook.errors.shareUnknown }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: m.notebook.errors.notAllowed }
  if (session.user.id === parsed.data.granteeId) return { error: m.notebook.errors.shareSelf }

  const { error } = await supabase.from('review_shares').insert({
    review_id: parsed.data.reviewId,
    grantee_id: parsed.data.granteeId,
    granted_by: session.user.id,
  })

  if (error) {
    if (error.code === '23505') return { error: m.notebook.errors.shareDuplicate }
    return { error: refusalMessage(error.code) }
  }

  revalidatePath(routes.notebookEntry(parsed.data.reviewId))
  return { done: true }
}

/**
 * Withdraws one person.
 *
 * Closes future access and nothing more: ADR 0004 is explicit that revoking
 * does not undo a reading that already happened, and the interface says so
 * rather than implying an unread. There is no UPDATE grant on this table — one
 * grants or one withdraws, an authorisation is never amended.
 */
export async function removeShare(formData: FormData): Promise<void> {
  const parsed = shareSchema.safeParse({
    reviewId: formData.get('reviewId'),
    granteeId: formData.get('granteeId'),
  })

  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase
    .from('review_shares')
    .delete()
    .eq('review_id', parsed.data.reviewId)
    .eq('grantee_id', parsed.data.granteeId)

  revalidatePath(routes.notebookEntry(parsed.data.reviewId))
}

/* -------------------------------------------------------------------------- */
/* Display preference                                                          */
/* -------------------------------------------------------------------------- */

const scaleSchema = z.object({ scale: z.enum(['100', '20']) })

/**
 * Flips the notebook between /100 and /20 (§5.4).
 *
 * A display preference, so it changes nothing stored: scores stay on 100, and
 * `formatScore()` divides at the last moment. Converting at write time would
 * put two scales in one column and lose which is which.
 *
 * The row always exists — `tg_handle_new_user()` creates it with the profile —
 * so this is an UPDATE and a missing row means the trigger did not run, which
 * is worth surfacing rather than papering over with an upsert.
 *
 * **This function throws, and the ones above return an error instead.** The
 * difference is who the failure belongs to. A refused review write is something
 * a member did — too long, out of range, not yours — and it deserves a sentence
 * in French. A refused preference write is something *we* did, and there is no
 * sentence to write: the member asked for /20 and we owe them /20.
 *
 * It is written this way because the first version swallowed the error and was
 * wrong for it. `updated_at` is not in the UPDATE grant of `profile_settings` —
 * the grant is `(birth_date, locale, preferences, privacy)`, and a trigger
 * stamps the rest — so setting it raised `42501`, the result went unchecked, and
 * the button did nothing at all, quietly, forever. Found by clicking it.
 */
export async function setScoreScale(formData: FormData): Promise<void> {
  const parsed = scaleSchema.safeParse({ scale: formData.get('scale') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return

  const { data: current } = await supabase
    .from('profile_settings')
    .select('preferences')
    .eq('id', session.user.id)
    .maybeSingle()

  const preferences =
    current?.preferences && typeof current.preferences === 'object'
      ? (current.preferences as Record<string, unknown>)
      : {}

  const { data, error } = await supabase
    .from('profile_settings')
    .update({
      // The CHECK reads `preferences ->> 'score_scale'`, which is text either
      // way; a number is written because that is what the column default holds.
      preferences: { ...preferences, score_scale: Number(parsed.data.scale) },
    })
    .eq('id', session.user.id)
    .select('id')

  if (error) throw new Error(`Could not store the score scale: ${error.message}`)
  // Zero rows is the quiet failure this whole comment is about: a policy that
  // declines an UPDATE does not raise, it matches nothing and reports nothing.
  if (!data || data.length === 0) throw new Error('The score scale was not stored.')

  revalidatePath(routes.notebook())
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                    */
/* -------------------------------------------------------------------------- */

/** The scope an entry had before this write, or null when it is unreadable. */
async function visibilityOf(id: string): Promise<ReviewVisibility | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('reviews').select('visibility').eq('id', id).maybeSingle()
  return data?.visibility ?? null
}

async function slugOfCigar(cigarId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .schema('ref')
    .from('cigars')
    .select('slug')
    .eq('id', cigarId)
    .maybeSingle()
  return data?.slug ?? null
}

/**
 * What every write does afterwards: re-render what changed, and refresh the
 * public average when — and only when — the write could have moved it.
 *
 * Both ends of the scope change are considered, because un-publishing moves the
 * average exactly as much as publishing: a refresh skipped on the way out
 * leaves a withdrawn note still counted. `affectsPublicAverage()` holds that
 * rule, so no call site has to remember it.
 */
async function settle(
  slug: string | null,
  before: ReviewVisibility | null,
  after: ReviewVisibility | null,
): Promise<void> {
  if (affectsPublicAverage(before, after)) await refreshCigarStats()

  if (slug) revalidatePath(routes.cigar(slug))
  revalidatePath(routes.notebook())
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? m.notebook.errors.unknown
}

function refusalMessage(code: string | undefined): string {
  return code === '42501' ? m.notebook.errors.notAllowed : m.notebook.errors.unknown
}
