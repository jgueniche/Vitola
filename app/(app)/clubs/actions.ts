'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { CLUB_DONE, CLUB_LIMITS, clubSlug } from '@/lib/social/groups'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write on a club (ADR 0010, D1 and D2).
 *
 * As on the feed, all of them go through the session client and none of them
 * restates a policy. What migration 0014 decides and this file never repeats:
 *
 *   - **Whose club it is** — `owner_id = auth.uid()` on insert, update and
 *     delete.
 *   - **Who may join** — anybody, except into the list of somebody they have
 *     blocked: joining a club puts you beside its owner, who is a member of it.
 *   - **Who may remove** — the member themselves, or the owner. Two DELETE
 *     policies, the shape `follows` already had.
 *   - **The member count** — a trigger recomputes it with a `count()`. It is in
 *     no grant, so this file could not write it if it tried.
 *
 * What is restated is shape: the two lengths, and the slug — which is a
 * duplication of *logic* and therefore pinned by `tests/unit/groups-model.test.ts`
 * against `clubs_slug_format`.
 */

export type ClubState = { error?: string; done?: boolean; slug?: string }

const copy = m.clubs.create

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.refused
}

/** A refusal by policy reads as a refusal; anything else keeps its message. */
function refusal(code: string | undefined, message: string): string {
  if (code === '42501') return copy.refused
  /* 23505 on `clubs_slug_key`: two clubs cannot share an address. The form
     already shows the address it is about to take, so this is the race and not
     the common case — but it is the one that would otherwise read as a crash. */
  if (code === '23505') return copy.slugTaken
  return message
}

export async function createClub(_previous: ClubState, formData: FormData): Promise<ClubState> {
  const parsed = z
    .object({
      name: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .min(
              CLUB_LIMITS.nameMin,
              copy.nameTooShort.replace('{min}', String(CLUB_LIMITS.nameMin)),
            )
            .max(
              CLUB_LIMITS.nameMax,
              copy.nameTooLong.replace('{max}', String(CLUB_LIMITS.nameMax)),
            ),
        ),
      description: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .max(
              CLUB_LIMITS.descriptionMax,
              copy.descriptionTooLong.replace('{max}', String(CLUB_LIMITS.descriptionMax)),
            ),
        ),
    })
    .safeParse({
      name: formData.get('name') ?? '',
      description: formData.get('description') ?? '',
    })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  /* The slug is derived here and not in the database, so the form can show the
     address before the club exists. `clubs_slug_format` refuses an empty one,
     and a name written entirely in punctuation produces exactly that. */
  const slug = clubSlug(parsed.data.name)
  if (slug.length === 0) return { error: copy.slugEmpty }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.refused }

  const { data, error } = await supabase
    .from('clubs')
    .insert({
      owner_id: auth.user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description.length > 0 ? parsed.data.description : null,
    })
    .select('slug')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.refused }

  revalidatePath(routes.clubs())
  return { done: true, slug: data.slug }
}

/**
 * Joining, leaving, removing, dissolving.
 *
 * All four **navigate** rather than return state, for the reason
 * `/notifications` wrote down: each removes the control that ran it — "Quitter"
 * becomes "Rejoindre", a removed member disappears from the list they were
 * removed from — so a component holding returned state is unmounted in the same
 * render and the reader sees nothing.
 */
export async function joinClub(formData: FormData): Promise<void> {
  const clubId = z.uuid().safeParse(formData.get('clubId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!clubId.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  /* Read the result of a write: `club_members_insert_own` refuses a block by
     returning no row rather than by raising, and "Vous avez rejoint le club"
     over nothing is the failure this rule exists for. */
  const { data } = await supabase
    .from('club_members')
    .insert({ club_id: clubId.data, user_id: auth.user.id })
    .select('club_id')
    .maybeSingle()

  revalidatePath(routes.club(slug.data))
  revalidatePath(routes.clubs())
  redirect(data ? `${routes.club(slug.data)}?fait=${CLUB_DONE.joined}` : routes.club(slug.data))
}

export async function leaveClub(formData: FormData): Promise<void> {
  const clubId = z.uuid().safeParse(formData.get('clubId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!clubId.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId.data)
    .eq('user_id', auth.user.id)

  revalidatePath(routes.club(slug.data))
  revalidatePath(routes.clubs())
  redirect(`${routes.club(slug.data)}?fait=${CLUB_DONE.left}`)
}

/**
 * The owner removes a member — `club_members_delete_owner`, the counterweight
 * that keeps D2's free join bearable.
 *
 * The `eq('user_id', …)` here names *whom* to remove and is not a right: the
 * policy decides whether this caller may, and a member who is not the owner
 * removes nobody however this form is posted.
 */
export async function removeClubMember(formData: FormData): Promise<void> {
  const clubId = z.uuid().safeParse(formData.get('clubId'))
  const userId = z.uuid().safeParse(formData.get('userId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!clubId.success || !userId.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('club_members').delete().eq('club_id', clubId.data).eq('user_id', userId.data)

  revalidatePath(routes.club(slug.data))
  redirect(`${routes.club(slug.data)}?fait=${CLUB_DONE.removed}`)
}

export async function deleteClub(formData: FormData): Promise<void> {
  const clubId = z.uuid().safeParse(formData.get('clubId'))
  if (!clubId.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('clubs').delete().eq('id', clubId.data)

  revalidatePath(routes.clubs())
  redirect(`${routes.clubs()}?fait=${CLUB_DONE.deleted}`)
}
