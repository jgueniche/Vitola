import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { SectionHead } from '@/components/layout/section-head'
import { formatCount, formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { listClubs, listEvents } from '@/lib/social/group-queries'
import { listFollowGraph, readFeedPage } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: m.circle.title }

const copy = m.circle

/**
 * Le Cercle — the social half of the site, on one page.
 *
 * It was a hub: five rows, five sentences, five links. QA of 12 septembre
 * 2026: « la page le cercle est un peu fade il faut la retravailler / remplir
 * avec des exemples des pages du cercle toi même pour qu'on puisse se rendre
 * compte ». Fade is the right word for a list of links to lists, and the cure
 * is not decoration — it is showing what is actually inside. So every section
 * here renders REAL rows and links on to its own page.
 *
 * The two formulas come from the same session: « abonnement : formule gratuite
 * avec carnet, les avis en consultation sont en mode payant ». They are shown
 * as an offer and nothing is charged or withheld — the Cercle's own line says
 * so. Arming the gate is a change to the SELECT policies of `reviews`, not a
 * flag and not a condition in a page, and it lands with the payment keys; ADR
 * 0017 is where that decision is written down.
 *
 * Cost: four reads, all bounded, none per row — the feed in one RPC call
 * (`feed_page`), the clubs, the next events, and the reader's own follow
 * graph. A visitor pays for none of them, because they are all behind a
 * session.
 */
export default async function CirclePage() {
  const user = await currentUser()

  const [feed, clubs, events, graph] = user
    ? await Promise.all([
        readFeedPage('discover', null, 4),
        listClubs(user.id),
        listEvents({ viewerId: user.id, from: new Date().toISOString(), limit: 3 }),
        listFollowGraph(user.id, 'following', 6),
      ])
    : [{ items: [], next: null }, [], [], []]

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12">
      <SectionHead eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />

      {/* ------------------------------------------------------- les formules */}
      <section aria-labelledby="formules" className="flex flex-col gap-3">
        <h2 id="formules" className="font-display text-display-sm">
          {copy.plansTitle}
        </h2>
        <ul className="border-rule grid border-t sm:grid-cols-2 sm:gap-x-10">
          <li className="border-rule flex flex-col gap-1 border-b py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-ink font-medium">{copy.freeName}</span>
              <span className="text-ink-muted text-sm tabular-nums">{copy.freePrice}</span>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">{copy.freeLine}</p>
            <p className="text-positive text-xs">{copy.freeIncluded}</p>
          </li>
          <li className="border-rule flex flex-col gap-1 border-b py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-ink font-medium">{copy.paidName}</span>
              <span className="text-ink-muted text-sm">{copy.paidPrice}</span>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed">{copy.paidLine}</p>
            <p className="text-caution text-xs">{copy.paidSoon}</p>
          </li>
        </ul>
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.plansNote}</p>
      </section>

      <Band variant="divider" />

      {/* ------------------------------------------------------------ le fil */}
      <section aria-labelledby="fil" className="flex flex-col gap-3">
        <SectionHead
          id="fil"
          level="h2"
          size="sm"
          title={copy.feedTitle}
          aside={
            <Link href={routes.feed()} className="text-accent hover:underline">
              {copy.feedAll}
            </Link>
          }
        />
        {feed.items.length === 0 ? (
          <EmptyState title={copy.feedTitle} description={copy.feedEmpty} />
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {feed.items.map((item) => (
              <li key={item.id} className="border-rule border-b py-3.5">
                <Link href={routes.post(item.id)} className="group block">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink group-hover:text-accent text-sm font-medium transition-colors duration-(--duration-quick)">
                      {item.author_display_name ?? item.author_handle ?? copy.membersTitle}
                    </span>
                    {item.cigar_name ? (
                      <span className="text-ink-muted text-xs">
                        {[item.brand_name, item.cigar_name].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  {item.body ? (
                    <span className="text-ink-muted mt-1 line-clamp-2 block text-sm leading-relaxed">
                      {item.body}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------- les clubs */}
      <section aria-labelledby="clubs" className="flex flex-col gap-3">
        <SectionHead
          id="clubs"
          level="h2"
          size="sm"
          title={copy.clubsTitle}
          aside={
            <Link href={routes.clubs()} className="text-accent hover:underline">
              {copy.clubsAll}
            </Link>
          }
        />
        {clubs.length === 0 ? (
          <EmptyState title={copy.clubsTitle} description={copy.clubsEmpty} />
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {clubs.slice(0, 4).map((club) => (
              <li key={club.id} className="border-rule border-b py-3.5">
                <Link href={routes.club(club.slug)} className="group block">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-ink group-hover:text-accent text-sm font-medium transition-colors duration-(--duration-quick)">
                      {club.name}
                    </span>
                    <span className="text-ink-faint text-xs tabular-nums">
                      {club.member_count === 1
                        ? copy.clubsMembersOne
                        : copy.clubsMembersMany.replace('{count}', formatCount(club.member_count))}
                    </span>
                  </span>
                  {club.description ? (
                    <span className="text-ink-muted mt-1 line-clamp-1 block text-sm">
                      {club.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------- l'agenda */}
      <section aria-labelledby="agenda" className="flex flex-col gap-3">
        <SectionHead
          id="agenda"
          level="h2"
          size="sm"
          title={copy.eventsTitle}
          aside={
            <Link href={routes.events()} className="text-accent hover:underline">
              {copy.eventsAll}
            </Link>
          }
        />
        {events.length === 0 ? (
          <EmptyState title={copy.eventsTitle} description={copy.eventsEmpty} />
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {events.map((event) => (
              <li key={event.id} className="border-rule border-b py-3.5">
                <Link href={routes.event(event.id)} className="group block">
                  <span className="text-ink group-hover:text-accent block text-sm font-medium transition-colors duration-(--duration-quick)">
                    {event.title}
                  </span>
                  <span className="text-ink-muted mt-1 block text-xs">
                    {formatDateTime(new Date(event.starts_at))}
                    {event.venue_name ? ` · ${event.venue_name}` : ''}
                    {event.location_text && !event.venue_name ? ` · ${event.location_text}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ members, messages */}
      <section className="flex flex-col gap-3">
        <ul className="border-rule flex flex-col border-t">
          <li className="border-rule border-b py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-ink text-sm font-medium">{copy.membersTitle}</span>
              <Link href={routes.members()} className="text-accent text-sm hover:underline">
                {copy.membersAll}
              </Link>
            </div>
            {graph.length > 0 ? (
              <p className="text-ink-muted mt-1 text-sm">
                {graph.map((person) => person.display_name ?? `@${person.handle}`).join(' · ')}
              </p>
            ) : null}
          </li>
          <li className="border-rule border-b py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-ink text-sm font-medium">{copy.messagesTitle}</span>
              <Link href={routes.conversations()} className="text-accent text-sm hover:underline">
                {copy.messagesAll}
              </Link>
            </div>
            <p className="text-ink-muted mt-1 text-sm">{copy.messagesLine}</p>
          </li>
          <li className="border-rule border-b py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-ink text-sm font-medium">{copy.journalTitle}</span>
              <Link href={routes.journal()} className="text-accent text-sm hover:underline">
                {copy.journalAll}
              </Link>
            </div>
            <p className="text-ink-muted mt-1 text-sm">{copy.journalLine}</p>
          </li>
        </ul>
      </section>
    </main>
  )
}
