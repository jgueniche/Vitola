import Link from 'next/link'

import { formatDateTime, formatTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { EventCard as EventCardRow } from '@/lib/social/group-queries'
import { type EventKind, isFull } from '@/lib/social/groups'

const copy = m.events

const KIND_LABELS: Record<EventKind, string> = {
  degustation: copy.kind.degustation,
  rencontre: copy.kind.rencontre,
  visite: copy.kind.visite,
  autre: copy.kind.autre,
}

/**
 * One event, as it appears in a list.
 *
 * The interval is written as one line when it ends the same day and as two
 * dates when it does not — a Saturday from 18 h to 23 h is one evening, and
 * saying it twice makes it look like two.
 *
 * "Complet" is shown when the count reaches the capacity, and the sentence
 * beside it on the event's own page says that no constraint enforces it: no
 * CHECK can compare a count to a column on another row, so this is a courtesy
 * and the host is what actually decides.
 */
export function EventCard({ event }: { event: EventCardRow }) {
  const starts = new Date(event.starts_at)
  const ends = event.ends_at ? new Date(event.ends_at) : null
  const sameDay = ends !== null && ends.toDateString() === starts.toDateString()

  return (
    <li className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={routes.event(event.id)}
          className="font-display text-ink hover:text-accent text-xl transition-colors duration-(--duration-quick)"
        >
          {event.title}
        </Link>
        <p className="text-ink-muted text-xs">{KIND_LABELS[event.kind]}</p>
      </div>

      <p className="text-ink-muted text-sm tabular-nums">
        {formatDateTime(starts)}
        {ends ? (sameDay ? ` – ${formatTime(ends)}` : ` → ${formatDateTime(ends)}`) : ''}
      </p>

      <p className="text-ink-muted text-xs">
        {event.venue_name && event.venue_slug ? (
          <Link href={routes.venue(event.venue_slug)} className="text-accent hover:underline">
            {event.venue_name}
          </Link>
        ) : (
          (event.location_text ?? copy.noPlace)
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

      <p className="text-ink-faint text-xs tabular-nums">
        {event.attendee_count === 1
          ? copy.attendeeCountOne
          : copy.attendeeCountMany.replace('{count}', String(event.attendee_count))}
        {event.capacity !== null
          ? ` · ${copy.capacity.replace('{count}', String(event.capacity))}`
          : ''}
        {isFull(event) ? ` · ${copy.full}` : ''}
        {event.viewer_status ? ` · ${copy.status[event.viewer_status]}` : ''}
      </p>
    </li>
  )
}
