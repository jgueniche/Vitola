import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { answerEvent, cancelEvent, withdrawFromEvent } from '@/app/(app)/evenements/actions'
import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { eventConfirmation } from '@/lib/social/confirmations'
import { getEvent, listAttendees } from '@/lib/social/group-queries'
import { ATTENDEE_STATUSES, type EventKind, isFull } from '@/lib/social/groups'
import { currentUser } from '@/lib/supabase/server'

const copy = m.events

const KIND_LABELS: Record<EventKind, string> = {
  degustation: copy.kind.degustation,
  rencontre: copy.kind.rencontre,
  visite: copy.kind.visite,
  autre: copy.kind.autre,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const event = await getEvent(id, null)
  return { title: event?.title ?? copy.notFound }
}

/**
 * Un événement.
 *
 * Three radio buttons and a submit, as a plain form: answering is a write, and
 * a write behind a GET is a write any link prefetcher performs. The answer is
 * an upsert on `(event_id, user_id)`, so changing one's mind is the same
 * gesture as answering.
 *
 * "Complet" says what the count says and refuses nothing, and the sentence
 * below it says so. No CHECK can compare `attendee_count` to `capacity` — a
 * constraint sees one row — so pretending the database enforces the limit would
 * be a screen making a promise nothing keeps.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.event(id))}`)
  }

  const event = await getEvent(id, user.id)
  if (!event) notFound()

  const query = await searchParams
  const done = eventConfirmation(query.fait)
  /* A refused answer is `event_attendees_insert_own` declining — a block, one
     way or the other. A page that simply repainted itself would leave somebody
     clicking the same button. */
  const refusedRaw = Array.isArray(query.erreur) ? query.erreur[0] : query.erreur
  const refused = refusedRaw === 'refus'
  const attendees = await listAttendees(event.id)

  const starts = new Date(event.starts_at)
  const ends = event.ends_at ? new Date(event.ends_at) : null
  const sameDay = ends !== null && ends.toDateString() === starts.toDateString()
  const isHost = event.host_id === user.id

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{KIND_LABELS[event.kind]}</p>
        <h1 className="font-display text-4xl leading-tight">{event.title}</h1>
        <p className="text-ink-muted text-sm tabular-nums">
          {formatDateTime(starts)}
          {ends ? (sameDay ? ` – ${formatTime(ends)}` : ` → ${formatDateTime(ends)}`) : ''}
        </p>
        <p className="text-ink-muted text-sm">{event.location_text ?? copy.noPlace}</p>
        <p className="text-ink-faint text-xs">
          {copy.hostedBy}{' '}
          {event.host_handle ? (
            <Link href={routes.member(event.host_handle)} className="text-accent hover:underline">
              {event.host_display_name ?? event.host_handle}
            </Link>
          ) : (
            m.messaging.unknownPerson
          )}
          {event.club_name && event.club_slug ? (
            <>
              {' · '}
              {copy.inClub}{' '}
              <Link href={routes.club(event.club_slug)} className="text-accent hover:underline">
                {event.club_name}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {refused ? (
        <p role="alert" className="text-negative measure text-sm leading-relaxed">
          {copy.answerRefused}
        </p>
      ) : null}

      {event.description ? (
        <p className="text-ink measure text-sm leading-relaxed whitespace-pre-line">
          {event.description}
        </p>
      ) : null}

      <p className="text-ink-muted text-sm tabular-nums">
        {event.attendee_count === 1
          ? copy.attendeeCountOne
          : copy.attendeeCountMany.replace('{count}', String(event.attendee_count))}
        {event.capacity !== null
          ? ` · ${copy.capacity.replace('{count}', String(event.capacity))}`
          : ''}
      </p>
      {isFull(event) ? (
        <p className="text-ink-faint measure text-xs leading-relaxed">
          {copy.full} — {copy.fullNote}
        </p>
      ) : null}

      <form
        action={answerEvent}
        className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border p-4"
      >
        <input type="hidden" name="eventId" value={event.id} />
        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow mb-1">{copy.answerLegend}</legend>
          <div className="flex flex-wrap gap-2">
            {ATTENDEE_STATUSES.map((status) => (
              <label
                key={status}
                className="border-rule bg-surface hover:border-rule-strong has-checked:border-accent has-checked:text-accent flex cursor-pointer items-center gap-2 rounded-[3px] border px-3 py-1.5 text-sm"
              >
                <input
                  type="radio"
                  name="status"
                  value={status}
                  defaultChecked={
                    event.viewer_status ? event.viewer_status === status : status === 'going'
                  }
                  className="accent-accent"
                />
                {copy.status[status]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Button type="submit" size="sm">
            {copy.answer}
          </Button>
        </div>
      </form>

      {event.viewer_status ? (
        <form action={withdrawFromEvent}>
          <input type="hidden" name="eventId" value={event.id} />
          <Button type="submit" variant="ghost" size="sm">
            {copy.withdraw}
          </Button>
        </form>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{copy.attendeesTitle}</h2>
        {attendees.length === 0 ? (
          <p className="text-ink-muted text-sm">{copy.attendeesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attendees.map((attendee) => (
              <li
                key={attendee.id}
                className="border-rule bg-surface flex items-center justify-between gap-3 rounded-[3px] border px-4 py-2 text-sm"
              >
                <Link
                  href={routes.member(attendee.handle)}
                  className="text-ink hover:text-accent transition-colors duration-(--duration-quick)"
                >
                  {attendee.display_name ?? attendee.handle}
                </Link>
                <span className="text-ink-muted text-xs">{copy.status[attendee.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHost ? (
        <form action={cancelEvent} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="eventId" value={event.id} />
          <Button type="submit" variant="ghost" size="sm">
            {copy.cancel}
          </Button>
          <span className="text-ink-faint measure text-xs leading-relaxed">
            {copy.cancelConfirm}
          </span>
        </form>
      ) : null}
    </main>
  )
}
