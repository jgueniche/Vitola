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
