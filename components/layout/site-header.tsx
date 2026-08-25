import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { countUnreadNotifications } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

/*
 * Four universes, not seventeen entries.
 *
 * The flat nav grew one link per delivered phase until it stopped being a map
 * of anything. Each entry is now a universe whose hub lists its sections with
 * a sentence each — one click more to reach a section, seventeen fewer things
 * to scan on every page. The nav-promise rule survives the regrouping: a hub
 * only lists destinations that exist, and the venues card of Q6 moved WITH its
 * flag from this header (read on every page, and once slow enough to redden
 * ten e2e) to the one page that makes the promise: the Autour hub.
 */
const NAV = [
  { label: m.nav.discover.label, href: routes.hubDiscover() },
  { label: m.nav.around.label, href: routes.hubAround() },
] as const

/* Shown only to a signed-in member: their sections all redirect a visitor to
   the sign-in page, and a nav entry whose one behaviour is to bounce you is a
   promise it cannot keep. */
const MEMBER_NAV = [
  { label: m.nav.mine.label, href: routes.hubMine() },
  { label: m.nav.circle.label, href: routes.hubCircle() },
] as const

/**
 * Rendered only inside app/(app)/, never on the public side — which is why
 * reading the session here is free: those routes are already dynamic, and the
 * landing page stays static and cacheable for the SEO target of Q13.
 */
export async function SiteHeader() {
  const user = await currentUser()
  /* A head count, so the badge costs no rows on every page of the site. Zero
     for a visitor without asking: `notifications_select_own` would answer
     nothing anyway, and a query per anonymous page view to learn that is a
     query too many. */
  const unread = user ? await countUnreadNotifications() : 0

  const nav = user ? [NAV[0], MEMBER_NAV[0], MEMBER_NAV[1], NAV[1]] : [...NAV]

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <Link href={routes.home()} className="font-display text-ink text-2xl leading-none">
          {BRAND.name}
        </Link>
        <nav aria-label={m.nav.mainLabel}>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {user ? (
              <li>
                <Link
                  href={routes.notifications()}
                  className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 transition-colors duration-(--duration-quick)"
                >
                  {m.notifications.eyebrow}
                  {unread > 0 ? (
                    <span className="border-accent text-accent rounded-[3px] border px-1.5 text-xs tabular-nums">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              </li>
            ) : null}
            {user ? (
              <li>
                <Link
                  href={routes.settings()}
                  className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
                >
                  {m.settings.title}
                </Link>
              </li>
            ) : null}
            <li className="border-rule ml-1 border-l pl-5">
              {user ? (
                /* A POST, not a link: signing out changes state, and a GET that
                   changes state gets fired by any link prefetcher that passes. */
                <form action={signOut}>
                  <button
                    type="submit"
                    className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
                  >
                    {m.auth.signOut}
                  </button>
                </form>
              ) : (
                <Link
                  href={routes.signIn()}
                  className="text-accent hover:text-accent-bright transition-colors duration-(--duration-quick)"
                >
                  {m.auth.title}
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
