import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { clubConfirmation } from '@/lib/social/confirmations'
import { listClubs } from '@/lib/social/group-queries'
import { currentUser } from '@/lib/supabase/server'

import { ClubForm } from './club-form'

export const metadata: Metadata = { title: m.clubs.title }

const copy = m.clubs

/**
 * Les clubs.
 *
 * A club is a group and a calendar (ADR 0010, D1). There is no feed inside one,
 * and the lede says so rather than leaving it to be discovered: `posts` has no
 * `club_id`, because a column that decides an audience must keep one meaning
 * and `visibility` would have had two depending on whether another column was
 * null.
 *
 * `clubs_select_all` shows every club to everybody, so the list is one query
 * with no predicate. The second query — which of them the reader has joined —
 * is a question and not a right: it changes a button's label, never a row's
 * presence.
 */
export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.clubs())}`)
  }

  const query = await searchParams
  const done = clubConfirmation(query.fait)
  const clubs = await listClubs(user.id)

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

      <ClubForm />

      {clubs.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {clubs.map((club) => (
            <li
              key={club.id}
              className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={routes.club(club.slug)}
                  className="text-ink hover:text-accent text-base font-medium transition-colors duration-(--duration-quick)"
                >
                  {club.name}
                </Link>
                <p className="text-ink-muted text-xs tabular-nums">
                  {club.member_count === 1
                    ? copy.memberCountOne
                    : copy.memberCountMany.replace('{count}', String(club.member_count))}
                </p>
              </div>

              {club.description ? (
                <p className="text-ink-muted measure text-sm leading-relaxed">{club.description}</p>
              ) : null}

              {club.viewer_is_member ? <p className="text-accent text-xs">{copy.joined}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
