'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Following, un-following, removing a follower, blocking (ADR 0007).
 *
 * Four gestures, four policies, and none of them restated here:
 *
 *   - `follows_insert_own` requires `follower_id = auth.uid()` **and**
 *     `not blocks_between(followee_id)`. One cannot follow on someone else's
 *     behalf, nor re-follow someone one has blocked.
 *   - `follows_delete_own` is un-following.
 *   - `follows_delete_followee` is **removing a follower**, and it is the
 *     counterweight the ADR's D1 rests on. A free follow with no removal would
 *     mean the author of a `followers`-scoped entry never chooses their
 *     audience at all.
 *   - `blocks_insert_own` plus the trigger that deletes any follow in either
 *     direction, so no follow row can survive a block.
 *
 * Every one of them reads the result of its write. A policy that refuses a
 * delete does not raise — it matches no row — and a confirmation over nothing
 * is the failure mode `CLAUDE.md` names as having already cost a day.
 */

export type PersonState = { error?: string; done?: string }

const copy = m.members

const target = z.object({ userId: z.uuid(), handle: z.string().min(1) })

function refusal(message: string): PersonState {
  return { error: message }
}

async function session() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user }
}

export async function follow(_previous: PersonState, formData: FormData): Promise<PersonState> {
  const parsed = target.safeParse({
    userId: formData.get('userId'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return refusal(copy.signedOutAction)

  const { supabase, user } = await session()
  if (!user) return refusal(copy.signedOutAction)

  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, followee_id: parsed.data.userId })
    .select('followee_id')

  /* 23505 is the primary key: already following. The end state is the one
     asked for, so it is a success rather than a message about a double click. */
  if (error && error.code !== '23505') return refusal(error.message)
  if (!error && (!data || data.length === 0)) return refusal(copy.signedOutAction)

  revalidatePath(routes.member(parsed.data.handle))
  revalidatePath(routes.feed())
  return { done: copy.followed }
}

export async function unfollow(_previous: PersonState, formData: FormData): Promise<PersonState> {
  const parsed = target.safeParse({
    userId: formData.get('userId'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return refusal(copy.signedOutAction)

  const { supabase, user } = await session()
  if (!user) return refusal(copy.signedOutAction)

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followee_id', parsed.data.userId)

  if (error) return refusal(error.message)

  revalidatePath(routes.member(parsed.data.handle))
  revalidatePath(routes.feed())
  return { done: copy.unfollowed }
}

/**
 * Removes someone from one's own followers.
 *
 * The mirror image of `unfollow`, and the two are not the same gesture even
 * though they delete from the same table: this one is exercised by the person
 * being read, on a row they did not create. `follows_delete_followee` is what
 * allows it, and it exists because ADR 0007 chose a free follow — the control
 * that an approval queue would have given *before* is given *after*, and it
 * stays exercisable rather than ageing.
 */
export async function removeFollower(
  _previous: PersonState,
  formData: FormData,
): Promise<PersonState> {
  const parsed = target.safeParse({
    userId: formData.get('userId'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return refusal(copy.signedOutAction)

  const { supabase, user } = await session()
  if (!user) return refusal(copy.signedOutAction)

  const { data, error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', parsed.data.userId)
    .eq('followee_id', user.id)
    .select('follower_id')

  if (error) return refusal(error.message)
  if (!data || data.length === 0) return refusal(copy.signedOutAction)

  revalidatePath(routes.member(parsed.data.handle))
  return { done: copy.removedFollower }
}

/**
 * Blocks, and the trigger cleans up behind it.
 *
 * Nothing here deletes a follow: `blocks_clear_follow` does, in the same
 * transaction, in both directions. Doing it here as well would be a second
 * implementation of the invariant, and the one that runs on a direct database
 * write would be the trigger anyway.
 */
export async function block(_previous: PersonState, formData: FormData): Promise<PersonState> {
  const parsed = target.safeParse({
    userId: formData.get('userId'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return refusal(copy.signedOutAction)

  const { supabase, user } = await session()
  if (!user) return refusal(copy.signedOutAction)

  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id: parsed.data.userId })

  if (error && error.code !== '23505') return refusal(error.message)

  /* The profile page is about to 404 for this reader — the RESTRICTIVE policy
     hides the person they just blocked — so the members list is where they
     land. Revalidating the profile anyway: the path has to be re-rendered for
     the 404 to be the thing that renders. */
  revalidatePath(routes.member(parsed.data.handle))
  revalidatePath(routes.members())
  revalidatePath(routes.feed())
  return { done: copy.blocked }
}

export async function unblock(_previous: PersonState, formData: FormData): Promise<PersonState> {
  const parsed = target.safeParse({
    userId: formData.get('userId'),
    handle: formData.get('handle'),
  })
  if (!parsed.success) return refusal(copy.signedOutAction)

  const { supabase, user } = await session()
  if (!user) return refusal(copy.signedOutAction)

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', parsed.data.userId)

  if (error) return refusal(error.message)

  revalidatePath(routes.member(parsed.data.handle))
  revalidatePath(routes.members())
  revalidatePath(routes.feed())
  return { done: copy.unblocked }
}
