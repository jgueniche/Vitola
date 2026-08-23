import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { clubConfirmation } from '@/lib/social/confirmations'
import { getClubBySlug, listClubMembers, listEvents } from '@/lib/social/group-queries'
import { type EventKind, isUpcoming } from '@/lib/social/groups'
import { currentUser } from '@/lib/supabase/server'

import { venueOptions } from '@/lib/venues/queries'

import { EventForm } from '../../evenements/event-form'
import { ClubControls, MemberRow } from './controls'

const copy = m.clubs

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const club = await getClubBySlug(slug)
  return { title: club?.name ?? copy.notFound }
}

const KIND_LABELS: Record<EventKind, string> = {
  degustation: m.events.kind.degustation,
  rencontre: m.events.kind.rencontre,
  visite: m.events.kind.visite,
  autre: m.events.kind.autre,
}

/**
 * Un club : ses membres, et son calendrier.
 *
 * The two things a club is, and nothing else. What is deliberately absent is a
 * list of publications — ADR 0010's first decision — and the announcement form
 * is the agenda's own component rather than a second one, so a club event and a
 * free-standing event are written the same way and refuse for the same reasons.
 *
 * `events_insert_own` requires membership for a club event, and the form is
 * only rendered to a member. That is a courtesy and not the barrier: an
 * `EXISTS` on `club_members` under its own RLS is what actually decides, and it
 * would refuse a hand-posted form just the same.
 */
export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.club(slug))}`)
  }

  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const query = await searchParams
  const done = clubConfirmation(query.fait)

  const [members, events] = await Promise.all([
    listClubMembers(club.id),
    listEvents({ viewerId: user.id, clubId: club.id, limit: 50 }),
  ])

  const isOwner = club.owner_id === user.id
  const isMember = members.some((member) => member.id === user.id)
  const owner = members.find((member) => member.id === club.owner_id)
  const upcoming = events.filter((event) => isUpcoming(event))

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{club.name}</h1>
        {club.description ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{club.description}</p>
        ) : null}
        <p className="text-ink-faint text-xs">
          {copy.owner}{' '}
          {owner ? (
            <Link href={routes.member(owner.handle)} className="text-accent hover:underline">
              {owner.display_name ?? owner.handle}
            </Link>
          ) : (
            m.messaging.unknownPerson
          )}
          {' · '}
          {club.member_count === 1
            ? copy.memberCountOne
            : copy.memberCountMany.replace('{count}', String(club.member_count))}
        </p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      <ClubControls clubId={club.id} slug={club.slug} isMember={isMember} isOwner={isOwner} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{copy.membersTitle}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.membersLede}</p>
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              clubId={club.id}
              slug={club.slug}
              /* The owner may remove anyone but themselves: leaving is the
                 gesture for that, and it dissolves nothing. */
              removable={isOwner && member.id !== club.owner_id}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{copy.agendaTitle}</h2>

        {upcoming.length === 0 ? (
          <EmptyState title={m.events.emptyTitle} description={copy.agendaEmpty} />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((event) => (
              <li
                key={event.id}
                className="border-rule bg-surface flex flex-col gap-1 rounded-[3px] border p-4"
              >
                <Link
                  href={routes.event(event.id)}
                  className="font-display text-ink hover:text-accent text-lg transition-colors duration-(--duration-quick)"
                >
                  {event.title}
                </Link>
                <p className="text-ink-muted text-xs">
                  {KIND_LABELS[event.kind]} · {formatDateTime(new Date(event.starts_at))}
                  {event.location_text ? ` · ${event.location_text}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}

        {isMember ? <EventForm clubId={club.id} clubName={club.name} venueOptions={await venueOptions()} /> : null}
      </section>
    </main>
  )
}
