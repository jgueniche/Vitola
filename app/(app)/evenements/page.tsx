import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { eventConfirmation } from '@/lib/social/confirmations'
import { listEvents } from '@/lib/social/group-queries'
import { isUpcoming } from '@/lib/social/groups'
import { currentUser } from '@/lib/supabase/server'

import { EventCard } from './event-card'
import { venueOptions } from '@/lib/venues/queries'

import { EventForm } from './event-form'

export const metadata: Metadata = { title: m.events.title }

const copy = m.events

/**
 * L'agenda.
 *
 * `events_select_all` shows every event to everybody, so this page runs one
 * query with no predicate and splits the result in TypeScript — which is the
 * distinction the repo keeps making: "ce qui est à venir" is a question about
 * what the page is *about*, and never a question of right.
 *
 * An index on `starts_at` serves the order. There is deliberately no partial
 * index on "future events": a partial index must be immutable and
 * `current_date` is not — the same trap the 18-year CHECK met from the other
 * end, met again here.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.events())}`)
  }

  const query = await searchParams
  const done = eventConfirmation(query.fait)

  const events = await listEvents({ viewerId: user.id, limit: 100 })
  const now = new Date()
  const upcoming = events.filter((event) => isUpcoming(event, now))
  const past = events.filter((event) => !isUpcoming(event, now)).reverse()

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      <EventForm venueOptions={await venueOptions()} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-display-sm">{copy.upcoming}</h2>
        {upcoming.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-display-sm">{copy.past}</h2>
          <ul className="flex flex-col gap-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
