'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type CommentState = { error?: string; done?: boolean }

/** Zod on every Server Action, per §8 of the brief. */
const bodySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, m.comments.errors.empty).max(2000, m.comments.errors.tooLong))

const postSchema = z.object({
  cigarId: z.uuid(),
  slug: z.string().min(1),
  body: bodySchema,
})

const editSchema = z.object({
  commentId: z.uuid(),
  slug: z.string().min(1),
  body: bodySchema,
})

const deleteSchema = z.object({
  commentId: z.uuid(),
  slug: z.string().min(1),
})

/**
 * Writing, editing and deleting a comment on a cigar entry.
 *
 * All three go through the session client, so RLS decides and nothing here
 * restates what a policy already says. That is not a stylistic preference: the
 * three rules that matter are all in migration 0004, and each of them would be
 * wrong to copy.
 *
 *   - **Who may speak** is `comment_min_role()`, read from a feature flag so it
 *     can be tightened the day signup opens without a deploy. Checking the role
 *     here would freeze in TypeScript a number meant to be turned.
 *   - **What may be commented on** is an `EXISTS` on `ref.cigars` inside the
 *     insert policy, itself subject to that table's RLS. A draft entry is
 *     therefore uncommentable without this file knowing what a draft is.
 *   - **Whose comment it is** is `author_id = auth.uid()`, and a hidden comment
 *     is excluded from the update policy — one corrects what one wrote, not what
 *     a moderator withdrew.
 *
 * The visible consequence is that a refusal arrives as a Postgres error rather
 * than as a branch taken here. `42501` is the policy saying no, and it is the
 * only refusal this file translates.
 *
 * There is no tobacco-vocabulary filter, and ADR 0005 measured why: passed six
 * ordinary comments, `isShopTextAllowed()` refuses four of them — *cigare*,
 * *havane*, *boîte de 25*, *vitole*. The guard is not broken; it exists to
 * refuse a shop listing, and the words of a forbidden listing are the words of
 * a legitimate comment. The criterion for a comment is incitement, not
 * vocabulary — the one-question test of `docs/editorial-guidelines.md` — and
 * that is a moderation judgement, which is what the reporting queue is for.
 */
export async function postComment(
  _previous: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const parsed = postSchema.safeParse({
    cigarId: formData.get('cigarId'),
    slug: formData.get('slug'),
    body: formData.get('body'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? m.comments.errors.unknown }
  }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: m.comments.errors.notAllowed }

  const { error } = await supabase.from('comments').insert({
    cigar_id: parsed.data.cigarId,
    author_id: session.user.id,
    body: parsed.data.body,
  })

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.cigar(parsed.data.slug))
  return { done: true }
}

/**
 * Takes a `FormData` and nothing else, unlike `postComment` above.
 *
 * Not an inconsistency: the new-comment form is driven by `useActionState`,
 * which passes the previous state; the edit form calls this from a transition
 * so it can close itself on success. React's lint rule forbids `setState` in an
 * effect, and closing an inline editor is precisely the thing an effect would
 * have been used for.
 */
export async function editComment(formData: FormData): Promise<CommentState> {
  const parsed = editSchema.safeParse({
    commentId: formData.get('commentId'),
    slug: formData.get('slug'),
    body: formData.get('body'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? m.comments.errors.unknown }
  }

  const supabase = await createSupabaseServerClient()
  const { error, count } = await supabase
    .from('comments')
    .update({ body: parsed.data.body }, { count: 'exact' })
    .eq('id', parsed.data.commentId)

  if (error) return { error: refusalMessage(error.code) }

  /*
   * An UPDATE that a policy refuses does not error — it matches no row and
   * reports zero. Treating that as success would show the old text back with a
   * confirmation, which is the worst of both: nothing saved, and nothing said.
   * This is the same trap as assertion T8 of the Phase 0 verification file,
   * which passed for two months by counting zero rows it had never inserted.
   */
  if (count === 0) return { error: m.comments.errors.notAllowed }

  revalidatePath(routes.cigar(parsed.data.slug))
  return { done: true }
}

export async function deleteComment(formData: FormData): Promise<void> {
  const parsed = deleteSchema.safeParse({
    commentId: formData.get('commentId'),
    slug: formData.get('slug'),
  })

  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('comments').delete().eq('id', parsed.data.commentId)

  revalidatePath(routes.cigar(parsed.data.slug))
}

/** The one refusal worth naming: `42501` is a policy declining, not a fault. */
function refusalMessage(code: string | undefined): string {
  return code === '42501' ? m.comments.errors.notAllowed : m.comments.errors.unknown
}

/* -------------------------------------------------------------------------- */
/* The one gesture — « J'en fume un »                                          */
/* -------------------------------------------------------------------------- */

import { saveLogEntry } from '@/app/(app)/carnet/actions'
import { smokeFromLot } from '@/app/(app)/cave/actions'
import { publishSession, shareEntryToFeed } from '@/app/(app)/fil/actions'
import { REVIEW_SCOPES } from '@/lib/reviews/model'

export type GestureState = {
  error?: string
  done?: boolean
  /** The notebook entry written, when something was written. */
  id?: string
  decremented?: boolean
  announced?: boolean
  /** The entry landed but the announcement did not: said, not swallowed. */
  notice?: string
}

const gestureSchema = z.object({
  cigarId: z.uuid(),
  slug: z.string().min(1),
  smokedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scoreTotal: z.string().nullable(),
  body: z.string().nullable(),
  visibility: z.enum(REVIEW_SCOPES),
  itemId: z.union([z.uuid(), z.literal('')]),
  venueId: z.union([z.uuid(), z.literal('')]),
  decrement: z.boolean(),
  announce: z.boolean(),
})

/**
 * « J'en fume un », from the cigar's own page (design audit, 5 septembre 2026).
 *
 * The sheet used to carry three forms for one moment — the cave's "j'en fume
 * un", the notebook's "noter ce cigare", the feed's "dire que vous le fumez" —
 * each asking the date, the score, the word and the scope again. This action
 * asks once and delegates to the three writes that already exist, in the
 * order the gesture happens:
 *
 *   1. The entry. With a lot ticked, `smokeFromLot()` — one transaction that
 *      decrements the lot and writes the entry (ADR 0006), and accepts an
 *      entry with nothing to say, because the event alone says one smoked.
 *      Without a lot, `saveLogEntry()`, whose constraint asks for a score or a
 *      word: a notebook entry with neither is not an entry.
 *   2. The announcement, optional. When an entry was written,
 *      `shareEntryToFeed()` publishes the post that points at it, at the
 *      entry's own scope (ADR 0007 — the trigger keeps them aligned for life).
 *      When nothing was written (decrement only), `publishSession()` says
 *      "je fume ce cigare" without an entry — and so does a venue: naming
 *      where one smokes is a session's fact (P5), which a shared entry does
 *      not carry, so a gesture with a venue announces as a session, with the
 *      word as its text, and the entry stays in the notebook. Neither accepts a scope narrower
 *      than `followers`: a publication is addressed to someone, and the form
 *      greys the box out for `private` and `shared` — re-checked here, because
 *      a form post is not bound by a disabled checkbox.
 *
 * Delegating keeps one source for each rule — the constraints' French, the
 * stats refresh, the revalidations — and this function adds no rule of its
 * own. A refused entry is the whole refusal; a refused announcement over an
 * entry that landed is a `notice`, because the entry is real and saying
 * otherwise would make someone write it twice.
 */
export async function smokeThisCigar(
  _previous: GestureState,
  formData: FormData,
): Promise<GestureState> {
  const parsed = gestureSchema.safeParse({
    cigarId: formData.get('cigarId'),
    slug: formData.get('slug'),
    smokedOn: formData.get('smokedOn'),
    scoreTotal: blankToNull(formData.get('scoreTotal')),
    body: blankToNull(formData.get('body')),
    visibility: formData.get('visibility'),
    itemId: formData.get('itemId') ?? '',
    venueId: formData.get('venueId') ?? '',
    decrement: formData.get('decrement') === 'on',
    announce: formData.get('announce') === 'on',
  })
  if (!parsed.success) return { error: m.notebook.errors.unknown }

  const gesture = parsed.data
  const fromLot = gesture.decrement && gesture.itemId !== ''

  let reviewId: string | undefined
  if (fromLot) {
    const lot = new FormData()
    lot.set('itemId', gesture.itemId)
    lot.set('qty', '1')
    lot.set('occurredOn', gesture.smokedOn)
    lot.set('visibility', gesture.visibility)
    if (gesture.scoreTotal) lot.set('score', gesture.scoreTotal)
    if (gesture.body) lot.set('body', gesture.body)
    lot.set('slug', gesture.slug)
    const result = await smokeFromLot({}, lot)
    if (result.error) return { error: result.error }
    reviewId = result.id
  } else {
    const entry = new FormData()
    entry.set('cigarId', gesture.cigarId)
    entry.set('slug', gesture.slug)
    entry.set('smokedOn', gesture.smokedOn)
    entry.set('visibility', gesture.visibility)
    if (gesture.scoreTotal) entry.set('scoreTotal', gesture.scoreTotal)
    if (gesture.body) entry.set('body', gesture.body)
    const result = await saveLogEntry({}, entry)
    if (result.error) return { error: result.error }
    reviewId = result.id
  }

  const state: GestureState = { done: true, id: reviewId, decremented: fromLot, announced: false }
  if (!gesture.announce) return state

  if (gesture.visibility !== 'followers' && gesture.visibility !== 'public') {
    return { ...state, notice: m.feed.share.tooNarrow }
  }

  if (reviewId && gesture.venueId === '') {
    const share = new FormData()
    share.set('reviewId', reviewId)
    const result = await shareEntryToFeed({}, share)
    return result.error ? { ...state, notice: result.error } : { ...state, announced: true }
  }

  const session = new FormData()
  session.set('cigarId', gesture.cigarId)
  session.set('slug', gesture.slug)
  session.set('venueId', gesture.venueId)
  session.set('visibility', gesture.visibility)
  session.set('body', gesture.body ?? '')
  const result = await publishSession({}, session)
  return result.error ? { ...state, notice: result.error } : { ...state, announced: true }
}

function blankToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}
