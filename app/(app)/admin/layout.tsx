import type { ReactNode } from 'react'

import { getRole } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

import { AdminNav } from './admin-nav'

/**
 * The admin area's chrome: one navigation bar over the seven screens, so no
 * screen is reachable only through a link somebody has to remember. Rendered
 * for admins only — a visitor or a member sees each page's own refusal, and
 * a nav offering seven refused doors would be noise, not navigation.
 *
 * The role read decides what to RENDER, never what may happen: every screen
 * behind this layout re-checks `adminView`, and every write re-checks a
 * policy or a door (ADR 0014).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser()
  const isAdmin = user ? hasMinRole(await getRole(user.id), 'admin') : false

  return (
    <>
      {isAdmin ? <AdminNav /> : null}
      {children}
    </>
  )
}
