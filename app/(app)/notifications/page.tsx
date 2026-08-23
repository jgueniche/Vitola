import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { listNotifications } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

import { clearRead, markAllRead } from './actions'

export const metadata: Metadata = { title: m.notifications.title }

const copy = m.notifications

/**
 * Mes notifications.
 *
 * Nothing on this page writes a notification, and nothing can: the table has no
 * INSERT grant and no INSERT policy. What one may do is mark one's own as read
 * and delete the read ones — the two gestures the column grant allows.
 *
 * `notifications_select_own` is the whole of the access rule, so this page runs
 * one query with no `user_id` filter in it. That is not a shortcut: adding the
 * filter would double the policy, and the day the policy changes the query
 * would be the one that stayed wrong.
 *
 * The two buttons are plain `<form action={…}>` server actions, so this page
 * ships no JavaScript at all. They **navigate** rather than return a message,
 * and that is `/contributions`' lesson applied a second time: marking
 * everything read removes the very button that did it, so a component holding a
 * returned state is unmounted in the same render and nobody reads anything. The
 * confirmation arrives with the URL, carrying `role="status"`.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.notifications())}`)
  }

  const query = await searchParams
  const doneRaw = Array.isArray(query.fait) ? query.fait[0] : query.fait
  const done =
    doneRaw === 'lu' ? copy.markedRead : doneRaw === 'efface' ? copy.cleared : null

  const rows = await listNotifications()
  const unread = rows.filter((row) => row.read_at === null).length
  const read = rows.length - unread

  const unreadLabel =
    unread === 1 ? copy.unreadOne : copy.unreadMany.replace('{count}', String(unread))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            {unread > 0 ? <p className="text-ink-muted text-sm">{unreadLabel}</p> : null}
            {unread > 0 ? (
              <form action={markAllRead}>
                <Button type="submit" variant="secondary" size="sm">
                  {copy.markAllRead}
                </Button>
              </form>
            ) : null}
            {read > 0 ? (
              <form action={clearRead}>
                <Button type="submit" variant="ghost" size="sm">
                  {copy.clear}
                </Button>
              </form>
            ) : null}
          </div>

          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const actor =
                row.actor?.display_name ??
                (row.actor ? `@${row.actor.handle}` : copy.someone)
              const sentence = copy.kind[row.kind].replace('{actor}', actor)

              return (
                <li
                  key={row.id}
                  className={
                    row.read_at === null
                      ? 'border-accent bg-surface-raised flex flex-col gap-1 rounded-[3px] border-l-2 px-4 py-3'
                      : 'border-rule bg-surface flex flex-col gap-1 rounded-[3px] border px-4 py-3'
                  }
                >
                  <p className="text-ink text-sm">{sentence}</p>
                  <p className="text-ink-faint flex flex-wrap items-center gap-x-3 text-xs">
                    <span>{formatDate(new Date(row.created_at))}</span>
                    {row.read_at === null ? <span className="eyebrow">{copy.unread}</span> : null}
                    {row.post_id ? (
                      <Link href={routes.post(row.post_id)} className="text-accent hover:underline">
                        {copy.openPost}
                      </Link>
                    ) : null}
                    {row.review_id ? (
                      <Link
                        href={routes.notebookEntry(row.review_id)}
                        className="text-accent hover:underline"
                      >
                        {copy.openEntry}
                      </Link>
                    ) : null}
                    {row.actor ? (
                      <Link
                        href={routes.member(row.actor.handle)}
                        className="text-accent hover:underline"
                      >
                        {copy.openProfile}
                      </Link>
                    ) : null}
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
