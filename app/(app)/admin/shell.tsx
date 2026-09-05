import { redirect } from 'next/navigation'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

const copy = m.admin

/**
 * The one gate all five admin screens share.
 *
 * The role decides what to RENDER, never what may happen: every write behind
 * these screens re-checks a policy or the door's own guard, and a member who
 * forged their way past this would write zero rows (ADR 0014). Signed out goes
 * to sign-in with `suite`, like every gated screen.
 */
export async function adminView(suite: string): Promise<boolean> {
  const user = await currentUser()
  if (!user) redirect(`${routes.signIn()}?suite=${encodeURIComponent(suite)}`)
  const account = await getAccount(user.id)
  return hasMinRole(account?.role ?? 'member', 'admin')
}

/** The explanation a non-admin reads — never a blank page (the /moderation pattern). */
export function AdminRestricted() {
  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.restrictedTitle}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.restrictedBody}</p>
      </div>
    </main>
  )
}
