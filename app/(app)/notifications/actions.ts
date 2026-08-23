'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The two things one may do to one's own notifications.
 *
 * Not writing one is the third, and it is enforced twice over: no INSERT grant
 * exists on the table, for anybody, and no INSERT policy either. Migration 0010
 * says why both — a grant removed comes back, a missing policy gets noticed.
 * Notifications are born of a gesture, by a SECURITY DEFINER trigger, and a
 * notification a client can fabricate is a notification that lies.
 *
 * `read_at` is the only writable column. `notifications_update_own` restricts
 * the row and the column grant restricts the field, so this file states
 * neither.
 */

/**
 * Both actions **navigate** rather than return a message, and that is the
 * lesson of `/contributions` applied a second time: marking everything read
 * removes the very button that did it, so the component holding a returned
 * state is unmounted in the same render and the reader sees nothing. Measured
 * then, not supposed. The confirmation lives on the arrival page, carried by
 * the URL, and it is a `role="status"` so a screen reader announces it.
 */
const DONE = 'fait'

export async function markAllRead(): Promise<void> {
  const supabase = await createSupabaseServerClient()

  /* `is('read_at', null)` narrows what this page is *about* — the unread ones —
     and never who may write: `notifications_update_own` decides that, and the
     row count that comes back is what the confirmation is allowed to claim. */
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .select('id')

  if (error) throw new Error(`Could not mark the notifications read: ${error.message}`)

  revalidatePath(routes.notifications())
  redirect(`${routes.notifications()}?${DONE}=lu`)
}

export async function clearRead(): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.from('notifications').delete().not('read_at', 'is', null)
  if (error) throw new Error(`Could not clear the notifications: ${error.message}`)

  revalidatePath(routes.notifications())
  redirect(`${routes.notifications()}?${DONE}=efface`)
}
