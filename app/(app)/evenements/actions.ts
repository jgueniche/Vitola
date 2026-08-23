'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { fromBrandZoneWallClock } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { ATTENDEE_STATUSES, EVENT_DONE, EVENT_KINDS, EVENT_LIMITS } from '@/lib/social/groups'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write on an event (ADR 0010, D3).
 *
 * The policies decide, as always, and this file repeats none of them:
 *
 *   - **Who may announce** — `host_id = auth.uid()`, and for a club event an
 *     `EXISTS` on `club_members` evaluated under its own RLS. A form posted by
 *     hand with somebody else's club identifier is refused there, not here.
 *   - **Who may cancel or correct** — the host. `events_update_host`.
 *   - **Who may answer** — anybody, except at the event of somebody they have
 *     blocked. `event_attendees_insert_own`.
 *   - **The attendee count** — a trigger recomputes it from `count(*) filter
 *     (where status = 'going')`. It is in no grant.
 *
 * The one thing worth reading twice is the date. A `<input
 * type="datetime-local">` yields `2026-09-10T20:00` with no zone, PostgREST
 * runs in UTC, and a tasting announced for 20 h would be stored at 22 h Paris
 * in summer. `fromBrandZoneWallClock()` reads it as the wall clock it is.
 */

export type EventState = { error?: string; done?: boolean; id?: string }

const copy = m.events.create

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.refused
}

function refusal(code: string | undefined, message: string): string {
  return code === '42501' ? copy.membersOnly : message
}

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max, tooLong))

export async function createEvent(_previous: EventState, formData: FormData): Promise<EventState> {
  const parsed = z
    .object({
      kind: z.enum(EVENT_KINDS),
      clubId: z.union([z.uuid(), z.literal('')]),
      title: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .min(
              EVENT_LIMITS.titleMin,
              copy.titleTooShort.replace('{min}', String(EVENT_LIMITS.titleMin)),
            )
            .max(
              EVENT_LIMITS.titleMax,
              copy.titleTooLong.replace('{max}', String(EVENT_LIMITS.titleMax)),
            ),
        ),
      description: optionalText(
        EVENT_LIMITS.descriptionMax,
        copy.descriptionTooLong.replace('{max}', String(EVENT_LIMITS.descriptionMax)),
      ),
      location: optionalText(
        EVENT_LIMITS.locationMax,
        copy.locationTooLong.replace('{max}', String(EVENT_LIMITS.locationMax)),
      ),
      startsAt: z.string().min(1, copy.badDate),
      endsAt: z.string(),
      capacity: z.string(),
    })
    .safeParse({
      kind: formData.get('kind'),
      clubId: formData.get('clubId') ?? '',
      title: formData.get('title') ?? '',
      description: formData.get('description') ?? '',
      location: formData.get('location') ?? '',
      startsAt: formData.get('startsAt') ?? '',
      endsAt: formData.get('endsAt') ?? '',
      capacity: formData.get('capacity') ?? '',
    })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const startsAt = fromBrandZoneWallClock(parsed.data.startsAt)
  if (!startsAt) return { error: copy.badDate }

  let endsAt: Date | null = null
  if (parsed.data.endsAt.length > 0) {
    endsAt = fromBrandZoneWallClock(parsed.data.endsAt)
    if (!endsAt) return { error: copy.badDate }
    /* `events_ends_after_start` says the same thing in `23514`, which is not a
       sentence. Both exist, and the database is the one that decides. */
    if (endsAt.getTime() <= startsAt.getTime()) return { error: copy.endsBeforeStart }
  }

  let capacity: number | null = null
  if (parsed.data.capacity.length > 0) {
    const value = Number(parsed.data.capacity)
    if (
      !Number.isInteger(value) ||
      value < EVENT_LIMITS.capacityMin ||
      value > EVENT_LIMITS.capacityMax
    ) {
      return {
        error: copy.capacityRange
          .replace('{min}', String(EVENT_LIMITS.capacityMin))
          .replace('{max}', String(EVENT_LIMITS.capacityMax)),
      }
    }
    capacity = value
  }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.refused }

  const { data, error } = await supabase
    .from('events')
    .insert({
      host_id: auth.user.id,
      club_id: parsed.data.clubId.length > 0 ? parsed.data.clubId : null,
      kind: parsed.data.kind,
      title: parsed.data.title,
      description: parsed.data.description.length > 0 ? parsed.data.description : null,
      location_text: parsed.data.location.length > 0 ? parsed.data.location : null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      capacity,
    })
    .select('id')
    .single()

  if (error) return { error: refusal(error.code, error.message) }
  if (!data) return { error: copy.refused }

  revalidatePath(routes.events())
  return { done: true, id: data.id }
}

/**
 * Answering, withdrawing, cancelling — all three navigate.
 *
 * Answering replaces the three radio buttons with the same three showing a
 * different one checked, so this one could have returned state; it does not,
 * because the attendee list beside it changes too and two mechanisms on one
 * page is one more than the page needs.
 *
 * **An upsert would have been the obvious shape, and it does not work here.**
 * PostgREST turns one into `insert … on conflict (event_id, user_id) do update
 * set` with *every column of the payload* on the right-hand side — `event_id`
 * and `user_id` included. Those two are in the INSERT grant and in no UPDATE
 * grant, deliberately: an answer does not move to another event or to somebody
 * else. So the upsert is refused with `42501`, and because a refused write
 * comes back as no row rather than raising, the page repainted itself showing
 * "0 personnes viennent" with no error anywhere. Found in a browser, on the
 * second click, by a walkthrough that read the number back.
 *
 * Update first, then insert if nothing was updated: two statements rather than
 * one, each inside its grant, each read back. Two people answering the same
 * event in the same instant is not a race worth a function — the loser gets
 * the refusal below and clicks again.
 */
export async function answerEvent(formData: FormData): Promise<void> {
  const eventId = z.uuid().safeParse(formData.get('eventId'))
  const status = z.enum(ATTENDEE_STATUSES).safeParse(formData.get('status'))
  if (!eventId.success || !status.success) return

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  const { data: changed } = await supabase
    .from('event_attendees')
    .update({ status: status.data })
    .eq('event_id', eventId.data)
    .eq('user_id', auth.user.id)
    .select('event_id')
    .maybeSingle()

  let answered = changed !== null

  if (!answered) {
    const { data: inserted } = await supabase
      .from('event_attendees')
      .insert({ event_id: eventId.data, user_id: auth.user.id, status: status.data })
      .select('event_id')
      .maybeSingle()
    answered = inserted !== null
  }

  revalidatePath(routes.event(eventId.data))
  revalidatePath(routes.events())
  /* A refusal here is `event_attendees_insert_own` declining, which means a
     block stands between the two of you. It says so rather than repainting an
     unchanged page. */
  redirect(
    answered
      ? `${routes.event(eventId.data)}?fait=${EVENT_DONE.answered}`
      : `${routes.event(eventId.data)}?erreur=refus`,
  )
}

export async function withdrawFromEvent(formData: FormData): Promise<void> {
  const eventId = z.uuid().safeParse(formData.get('eventId'))
  if (!eventId.success) return

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  await supabase
    .from('event_attendees')
    .delete()
    .eq('event_id', eventId.data)
    .eq('user_id', auth.user.id)

  revalidatePath(routes.event(eventId.data))
  revalidatePath(routes.events())
  redirect(`${routes.event(eventId.data)}?fait=${EVENT_DONE.withdrawn}`)
}

export async function cancelEvent(formData: FormData): Promise<void> {
  const eventId = z.uuid().safeParse(formData.get('eventId'))
  if (!eventId.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('events').delete().eq('id', eventId.data)

  revalidatePath(routes.events())
  redirect(`${routes.events()}?fait=${EVENT_DONE.cancelled}`)
}
