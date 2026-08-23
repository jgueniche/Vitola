'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  FREEFORM_POST_KINDS,
  POST_LIMITS,
  POST_SCOPES,
  type PostKind,
  type PostScope,
} from '@/lib/social/model'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write of the feed (ADR 0007).
 *
 * All of them go through the session client, so RLS decides and nothing here
 * restates a policy. The rules that matter live in migration 0010 and each
 * would be wrong to copy:
 *
 *   - **Whose publication it is** — `author_id = auth.uid()` on insert, update
 *     and delete. This file never checks.
 *   - **Who may speak** — `has_min_role(comment_min_role())` inside the insert
 *     policy, so the `comments_min_role` flag governs the feed and the cigar
 *     page with one setting rather than two.
 *   - **What a review_share may say** — the policy compares the post's scope to
 *     the entry's, and `owns_review()` proves the entry is the author's. A
 *     publication cannot be more visible than the entry it points at, and this
 *     file never mentions ADR 0004.
 *   - **Who is blocked** — a RESTRICTIVE policy, evaluated on every read. There
 *     is no `not in (…)` anywhere in this codebase, and there must not be: a
 *     block applied in TypeScript is a block that any other page walks around.
 *
 * What IS restated is shape — lengths, the two scopes, the kinds a text box can
 * produce. A CHECK refuses in `23514`, which is not a sentence anyone reads.
 *
 * `42501` is a policy declining, not a fault: it is what a refused publication
 * looks like, and it is reported as a refusal rather than as an error.
 */

export type PostState = { error?: string; done?: boolean; id?: string }

const copy = m.feed

const scopeSchema = z.enum(POST_SCOPES)

const bodySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, copy.compose.emptyBody)
      .max(POST_LIMITS.bodyMax, copy.compose.tooLong.replace('{max}', String(POST_LIMITS.bodyMax))),
  )

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.compose.refused
}

/** A refusal by policy reads as a refusal; anything else keeps its message. */
function refusal(code: string | undefined, message: string): string {
  return code === '42501' ? copy.compose.refused : message
}

/**
 * Writes a publication, then re-reads it.
 *
 * `.select('id').single()` is not decoration. Three bugs of the same family
 * have cost this repository a day between them, and the lesson written into
 * `CLAUDE.md` is the one applied here: always read the result of a write. An
 * insert a policy refuses does not throw on its own — it can come back with no
 * row — and reporting "Publié." over nothing is the worst possible outcome.
 */
export async function publishPost(_previous: PostState, formData: FormData): Promise<PostState> {
  const parsed = z
    .object({
      kind: z.enum(FREEFORM_POST_KINDS),
      visibility: scopeSchema,
      body: bodySchema,
    })
    .safeParse({
      kind: formData.get('kind'),
      visibility: formData.get('visibility'),
      body: formData.get('body') ?? '',
    })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.compose.refused }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: auth.user.id,
      kind: parsed.data.kind,
      visibility: parsed.data.visibility,
      body: parsed.data.body,
    })
    .select('id')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.compose.refused }

  revalidatePath(routes.feed())
  return { done: true, id: data.id }
}

/**
 * A "je fume" publication, from the cigar's own page.
 *
 * Separate from `publishPost` because `posts_session_has_cigar` demands a
 * cigar, and the only screen that has one to hand without asking anybody to
 * type an identifier is the cigar's. The body is optional here and required
 * there: `posts_has_substance` accepts a publication that shows an object
 * instead of saying something.
 */
export async function publishSession(
  _previous: PostState,
  formData: FormData,
): Promise<PostState> {
  const parsed = z
    .object({
      cigarId: z.uuid(),
      slug: z.string().min(1),
      venueId: z.union([z.uuid(), z.literal('')]),
      visibility: scopeSchema,
      body: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .max(
              POST_LIMITS.bodyMax,
              copy.compose.tooLong.replace('{max}', String(POST_LIMITS.bodyMax)),
            ),
        ),
    })
    .safeParse({
      cigarId: formData.get('cigarId'),
      slug: formData.get('slug'),
      venueId: formData.get('venueId') ?? '',
      visibility: formData.get('visibility'),
      body: formData.get('body') ?? '',
    })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.compose.refused }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: auth.user.id,
      kind: 'session' satisfies PostKind,
      visibility: parsed.data.visibility,
      cigar_id: parsed.data.cigarId,
      venue_id: parsed.data.venueId.length > 0 ? parsed.data.venueId : null,
      body: parsed.data.body === '' ? null : parsed.data.body,
    })
    .select('id')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.compose.refused }

  revalidatePath(routes.feed())
  revalidatePath(routes.cigar(parsed.data.slug))
  return { done: true, id: data.id }
}

/**
 * Announces a notebook entry on the feed.
 *
 * The scope is not a parameter: it is read from the entry and copied. That is
 * ADR 0004's constraint made unavoidable rather than merely enforced — a form
 * that offered a choice here would be offering to widen an audience by
 * accident, and the policy would refuse the wide half with a `42501` nobody
 * could act on. The trigger then keeps the two in step for the rest of their
 * lives, including deleting the publication if the entry closes.
 */
export async function shareEntryToFeed(
  _previous: PostState,
  formData: FormData,
): Promise<PostState> {
  const parsed = z
    .object({ reviewId: z.uuid() })
    .safeParse({ reviewId: formData.get('reviewId') })
  if (!parsed.success) return { error: copy.compose.refused }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.compose.refused }

  const { data: entry, error: entryError } = await supabase
    .from('reviews')
    .select('id, visibility')
    .eq('id', parsed.data.reviewId)
    .maybeSingle()

  if (entryError) return { error: entryError.message }
  if (!entry) return { error: copy.compose.refused }
  if (entry.visibility !== 'followers' && entry.visibility !== 'public') {
    return { error: copy.share.tooNarrow }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: auth.user.id,
      kind: 'review_share' satisfies PostKind,
      visibility: entry.visibility satisfies PostScope,
      review_id: entry.id,
    })
    .select('id')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.compose.refused }

  revalidatePath(routes.feed())
  revalidatePath(routes.notebookEntry(entry.id))
  return { done: true, id: data.id }
}

export async function deletePost(_previous: PostState, formData: FormData): Promise<PostState> {
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: copy.compose.refused }

  const supabase = await createSupabaseServerClient()

  /* `.select('id')` on a delete, for the same reason as on an insert: a policy
     that refuses a delete does not raise, it matches no row. Reading what came
     back is the difference between "supprimée" and a confirmation over a
     publication that is still there. */
  const { data, error } = await supabase.from('posts').delete().eq('id', id).select('id')

  if (error) return { error: refusal(error.code, error.message) }
  if (!data || data.length === 0) return { error: copy.compose.refused }

  revalidatePath(routes.feed())
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Braises                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Adds or removes one ember.
 *
 * Two statements rather than an upsert, because the two gestures are different
 * and the button says which one it is. `ember_count` is never touched here: it
 * is held by a trigger that recomputes it with a `count()`, and it is outside
 * every grant, so this file could not write it if it tried. That is the
 * `humidor_items.qty` rule (ADR 0006) applied a second time, for the reason it
 * was written the first: a counter that is incremented drifts once and then
 * lies forever.
 */
export async function toggleEmber(_previous: PostState, formData: FormData): Promise<PostState> {
  const parsed = z
    .object({ postId: z.uuid(), on: z.enum(['1', '0']) })
    .safeParse({ postId: formData.get('postId'), on: formData.get('on') })
  if (!parsed.success) return { error: copy.compose.refused }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.compose.refused }

  if (parsed.data.on === '1') {
    const { error } = await supabase
      .from('post_reactions')
      .insert({ post_id: parsed.data.postId, user_id: auth.user.id })
    /* 23505 is the primary key doing its job: someone double-clicked, or two
       tabs agreed. The end state is the one asked for, so it is not an error. */
    if (error && error.code !== '23505') return { error: refusal(error.code, error.message) }
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', parsed.data.postId)
      .eq('user_id', auth.user.id)
    if (error) return { error: refusal(error.code, error.message) }
  }

  revalidatePath(routes.feed())
  revalidatePath(routes.post(parsed.data.postId))
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                    */
/* -------------------------------------------------------------------------- */

export async function commentOnPost(_previous: PostState, formData: FormData): Promise<PostState> {
  const parsed = z
    .object({
      postId: z.uuid(),
      body: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .min(1, copy.comments.emptyBody)
            .max(
              POST_LIMITS.commentMax,
              copy.comments.tooLong.replace('{max}', String(POST_LIMITS.commentMax)),
            ),
        ),
    })
    .safeParse({ postId: formData.get('postId'), body: formData.get('body') ?? '' })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.compose.refused }

  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: parsed.data.postId,
      author_id: auth.user.id,
      body: parsed.data.body,
    })
    .select('id')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.compose.refused }

  revalidatePath(routes.post(parsed.data.postId))
  return { done: true, id: data.id }
}

export async function deletePostComment(
  _previous: PostState,
  formData: FormData,
): Promise<PostState> {
  const parsed = z
    .object({ id: z.uuid(), postId: z.uuid() })
    .safeParse({ id: formData.get('id'), postId: formData.get('postId') })
  if (!parsed.success) return { error: copy.compose.refused }

  const supabase = await createSupabaseServerClient()

  /* Two policies can let this through — the author's own, and the host's, who
     moderates the conversation under their own publication. Neither is stated
     here; the row that comes back says which one applied. */
  const { data, error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: refusal(error.code, error.message) }
  if (!data || data.length === 0) return { error: copy.compose.refused }

  revalidatePath(routes.post(parsed.data.postId))
  return { done: true }
}
