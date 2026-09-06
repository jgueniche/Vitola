import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { deleteMessage, markConversationRead } from '@/app/(app)/messages/actions'
import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { messagingConfirmation } from '@/lib/social/confirmations'
import { getConversation, getPersonById, readMessagePage } from '@/lib/social/group-queries'
import { currentUser } from '@/lib/supabase/server'

import { MessageComposer } from './composer'

const copy = m.messaging

export const metadata: Metadata = { title: copy.title }

/**
 * Une conversation.
 *
 * A page whose whole access rule is two policies: `conversations_select_own`
 * and, over it, `conversations_block_restrictive`. A conversation that is not
 * the reader's comes back as no rows and this page 404s — the same treatment a
 * notebook entry one may not open gets, and it does not distinguish "does not
 * exist" from "not for you".
 *
 * Newest first, keyset on `(created_at, id)`. An offset would repeat or skip a
 * message the moment one arrives mid-read, and a conversation is exactly where
 * that happens.
 *
 * Opening this page writes nothing. Marking read is a button, and the note
 * beside it says why: the sender can see `read_at`, so a receipt that fires
 * because a link was prefetched is a receipt that lies about a person.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.conversation(id))}`)
  }

  const conversation = await getConversation(id)
  if (!conversation) notFound()

  const query = await searchParams
  const done = messagingConfirmation(query.fait)

  const cursorRaw = Array.isArray(query.avant) ? query.avant[0] : query.avant
  const [createdAt, cursorId] = (cursorRaw ?? '').split('~')
  const before = createdAt && cursorId ? { createdAt, id: cursorId } : null

  const page = await readMessagePage(id, before)

  const otherId = conversation.member_a === user.id ? conversation.member_b : conversation.member_a

  /* One extra query for the name at the top. `profiles` is under its own RLS,
     so a member who is not discoverable comes back missing and the heading says
     "Membre" — never an identifier. */
  const profile = await getPersonById(otherId)

  const otherName = profile?.display_name ?? profile?.handle ?? copy.unknownPerson
  const unread = page.items.filter(
    (message) => message.sender_id !== user.id && message.read_at === null,
  ).length

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-sm leading-tight">
          {copy.withPerson.replace('{name}', otherName)}
        </h1>
        <p className="text-ink-faint text-xs">
          <Link href={routes.conversations()} className="text-accent hover:underline">
            {copy.backToInbox}
          </Link>
          {profile?.handle ? (
            <>
              {' · '}
              <Link href={routes.member(profile.handle)} className="text-accent hover:underline">
                @{profile.handle}
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

      <MessageComposer conversationId={id} />

      {unread > 0 ? (
        <form action={markConversationRead} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="conversationId" value={id} />
          <Button type="submit" variant="secondary" size="sm">
            {copy.markRead}
          </Button>
          <span className="text-ink-faint measure text-xs leading-relaxed">
            {copy.markReadNote}
          </span>
        </form>
      ) : null}

      {page.items.length === 0 ? (
        <p className="text-ink-muted text-sm">{copy.noMessageYet}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((message) => {
            const mine = message.sender_id === user.id
            return (
              <li
                key={message.id}
                className={`border-rule flex flex-col gap-1 rounded-[3px] border p-4 ${
                  mine ? 'bg-surface-raised' : 'bg-surface'
                }`}
              >
                <p className="text-ink text-sm leading-relaxed whitespace-pre-line">
                  {message.body}
                </p>
                <p className="text-ink-faint flex flex-wrap items-center gap-2 text-xs tabular-nums">
                  <span>{formatDateTime(new Date(message.created_at))}</span>
                  {mine ? (
                    <>
                      <span>{message.read_at ? copy.readAt : copy.unread}</span>
                      <form action={deleteMessage}>
                        <input type="hidden" name="messageId" value={message.id} />
                        <input type="hidden" name="conversationId" value={id} />
                        <button
                          type="submit"
                          className="text-ink-faint hover:text-negative transition-colors duration-(--duration-quick)"
                        >
                          {copy.deleteMessage}
                        </button>
                      </form>
                    </>
                  ) : null}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {page.older ? (
        <Link
          href={`${routes.conversation(id)}?avant=${encodeURIComponent(page.older)}`}
          className="text-accent text-sm hover:underline"
        >
          {copy.older}
        </Link>
      ) : (
        <p className="text-ink-faint text-xs">{copy.startOfConversation}</p>
      )}
    </main>
  )
}
