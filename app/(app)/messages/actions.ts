'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { MESSAGE_DONE, MESSAGE_LIMITS } from '@/lib/social/groups'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write on a conversation (ADR 0010, D4 and D5).
 *
 * Nothing here checks who may write to whom, and that is the point:
 *
 *   - **The pair** — `conversation_with()` computes `least`/`greatest` so the
 *     pair is canonical. Doing it here would mean the client knowing the
 *     table's convention, and forgetting it once would create a duplicate the
 *     unique index refuses with an unreadable error.
 *   - **The link** — `conversations_insert_linked` requires a follow in either
 *     direction and no block. The picker only offers reachable people, which is
 *     a courtesy so the form is not a trap; the policy is what refuses.
 *   - **Marking read** — `messages_update_recipient` allows it only to somebody
 *     who is not the sender, and `read_at` is the only column in the grant.
 *   - **Deleting** — the sender, and it removes the message for both. A "delete
 *     on my side" would be a button that lies.
 *
 * `conversation_with()` is SECURITY INVOKER, so it cannot open a conversation
 * the caller could not have opened by hand. A PostgREST call is a transaction,
 * not a privilege.
 */

export type MessageState = { error?: string; done?: boolean }

const copy = m.messaging.compose

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.refused
}

/**
 * Opens — or finds — the conversation with somebody, and goes to it.
 *
 * `22023` is what `conversation_with()` raises for a pair that is not two
 * distinct people; `42501` is the INSERT policy declining, which is the
 * "you follow neither way" case and reads as that sentence.
 */
export async function openConversation(formData: FormData): Promise<void> {
  const other = z.uuid().safeParse(formData.get('otherId'))
  if (!other.success) redirect(routes.conversations())

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('conversation_with', { other: other.data })

  if (error || !data) {
    redirect(`${routes.conversations()}?erreur=lien`)
  }

  revalidatePath(routes.conversations())
  redirect(routes.conversation(data))
}

/**
 * Sends a message, and marks the conversation read on the way.
 *
 * Answering somebody is unambiguous evidence of having read them, which is why
 * the receipt may be written here and not on render. The update touches only
 * messages the caller did not send: `messages_update_recipient` would refuse
 * the others anyway, and saying it here as well would be doubling a policy —
 * so the filter is on `read_at is null`, which is what the write is *about*.
 */
export async function sendMessage(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const parsed = z
    .object({
      conversationId: z.uuid(),
      body: z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .min(MESSAGE_LIMITS.bodyMin, copy.emptyBody)
            .max(
              MESSAGE_LIMITS.bodyMax,
              copy.tooLong.replace('{max}', String(MESSAGE_LIMITS.bodyMax)),
            ),
        ),
    })
    .safeParse({
      conversationId: formData.get('conversationId'),
      body: formData.get('body') ?? '',
    })

  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: copy.refused }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: parsed.data.conversationId,
      sender_id: auth.user.id,
      body: parsed.data.body,
    })
    .select('id')
    .single()

  if (error) return { error: error.code === '42501' ? copy.notLinked : error.message }
  if (!data) return { error: copy.refused }

  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', parsed.data.conversationId)
    .is('read_at', null)

  revalidatePath(routes.conversation(parsed.data.conversationId))
  revalidatePath(routes.conversations())
  return { done: true }
}

/**
 * Marks a conversation read, on purpose.
 *
 * Opening the page does **not** do this, and the note beside the button says
 * why: a read receipt that fires because Next prefetched a link is a receipt
 * that lies, and the sender can see it — `messages_select_own` shows both
 * members every column, `read_at` included.
 */
export async function markConversationRead(formData: FormData): Promise<void> {
  const conversationId = z.uuid().safeParse(formData.get('conversationId'))
  if (!conversationId.success) return

  const supabase = await createSupabaseServerClient()
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId.data)
    .is('read_at', null)

  revalidatePath(routes.conversation(conversationId.data))
  revalidatePath(routes.conversations())
  redirect(`${routes.conversation(conversationId.data)}?fait=${MESSAGE_DONE.read}`)
}

export async function deleteMessage(formData: FormData): Promise<void> {
  const messageId = z.uuid().safeParse(formData.get('messageId'))
  const conversationId = z.uuid().safeParse(formData.get('conversationId'))
  if (!messageId.success || !conversationId.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('messages').delete().eq('id', messageId.data)

  revalidatePath(routes.conversation(conversationId.data))
  revalidatePath(routes.conversations())
  redirect(`${routes.conversation(conversationId.data)}?fait=${MESSAGE_DONE.deleted}`)
}
