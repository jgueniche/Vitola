import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { messagingConfirmation } from '@/lib/social/confirmations'
import { INBOX_PAGE_SIZE, listReachablePeople, readInbox } from '@/lib/social/group-queries'
import { currentUser } from '@/lib/supabase/server'

import { openConversation } from './actions'

export const metadata: Metadata = { title: m.messaging.title }

const copy = m.messaging

/**
 * La boîte de réception.
 *
 * One call — `conversation_inbox()` — because "who is the other one", "what was
 * the last message" and "how many have I not read" are per-row questions, which
 * is the N+1 shape `feed_page()` exists to avoid. The function has no audience
 * predicate: `conversations_select_own` and the RESTRICTIVE block policy are
 * the whole of the access rule, here as everywhere.
 *
 * The paragraph about encryption is not a disclaimer added late. ADR 0010 took
 * the decision that was in none of the options — a message is not end-to-end
 * encrypted and the platform can read it — because art. 16 of the DSA requires
 * a reported message to be examinable, and a messaging feature implying a
 * confidentiality it does not offer is worse than a frank one.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.conversations())}`)
  }

  const query = await searchParams
  const done = messagingConfirmation(query.fait)

  const [inbox, reachable] = await Promise.all([readInbox(), listReachablePeople(user.id)])

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      <p className="border-rule text-ink-muted measure rounded-[3px] border border-dashed px-4 py-3 text-xs leading-relaxed">
        {copy.notEncrypted}
      </p>

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {reachable.length === 0 ? (
        <EmptyState
          title={copy.noReachableTitle}
          description={copy.noReachableBody}
          action={
            <Link href={routes.members()} className="text-accent text-sm hover:underline">
              {copy.emptyAction}
            </Link>
          }
        />
      ) : (
        /* A plain form: opening a conversation writes a row, and a write behind
           a GET is a write any link prefetcher performs. */
        <form
          action={openConversation}
          className="border-rule bg-surface flex flex-wrap items-end gap-3 rounded-[3px] border p-4"
        >
          <div className="flex min-w-56 flex-1 flex-col gap-2">
            <label htmlFor="other" className="eyebrow block">
              {copy.newPerson}
            </label>
            <Select id="other" name="otherId" defaultValue={reachable[0]?.id}>
              {reachable.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name ?? person.handle}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">{copy.newSubmit}</Button>
        </form>
      )}

      {inbox.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-2">
          {inbox.map((row) => (
            <li
              key={row.conversation_id}
              className="border-rule bg-surface flex flex-col gap-1 rounded-[3px] border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={routes.conversation(row.conversation_id)}
                  className="text-ink hover:text-accent text-sm font-medium transition-colors duration-(--duration-quick)"
                >
                  {row.other_display_name ?? row.other_handle ?? copy.unknownPerson}
                </Link>
                {row.unread_count > 0 ? (
                  <span className="border-accent text-accent rounded-[3px] border px-1.5 text-xs tabular-nums">
                    {row.unread_count === 1
                      ? copy.unreadOne
                      : copy.unreadMany.replace('{count}', String(row.unread_count))}
                  </span>
                ) : null}
              </div>

              <p className="text-ink-muted measure line-clamp-2 text-sm leading-relaxed">
                {row.last_body === null
                  ? copy.noMessageYet
                  : `${row.last_sender_id === user.id ? copy.youPrefix : ''}${row.last_body}`}
              </p>

              {row.last_message_at ? (
                <p className="text-ink-faint text-xs tabular-nums">
                  {formatDateTime(new Date(row.last_message_at))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* A cap that stays quiet reads as a complete list. */}
      {inbox.length === INBOX_PAGE_SIZE ? (
        <p className="text-ink-faint text-xs">
          {copy.inboxFull.replace('{count}', String(INBOX_PAGE_SIZE))}
        </p>
      ) : null}
    </main>
  )
}
