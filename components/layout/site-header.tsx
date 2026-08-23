import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { countUnreadNotifications } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

/*
 * Only destinations that exist.
 *
 * Lieux (P5), Journal (P6) and Boutique (P7) were listed here from P0 to show
 * the shape of the product. They have no page, so every visitor got a 404 on
 * click — and Next prefetches nav links, so the 404s were already firing on
 * page load without anyone clicking anything. A nav is a promise; each entry
 * comes back with its phase.
 */
const NAV = [
  { label: 'Cigares', href: routes.cigars() },
  { label: 'Marques', href: routes.brands() },
  { label: 'Vitoles', href: routes.vitolas() },
  { label: 'Arômes', href: routes.aromas() },
  { label: 'Codes de boîte', href: routes.boxCodes() },
] as const

/* Shown only to a signed-in member, because that is the only person it is a
   destination for: /carnet redirects a visitor to the sign-in page, and a nav
   entry whose one behaviour is to bounce you is a promise it cannot keep. */
const MEMBER_NAV = [
  { label: m.feed.title, href: routes.feed() },
  { label: m.members.title, href: routes.members() },
  { label: m.clubs.title, href: routes.clubs() },
  { label: m.events.title, href: routes.events() },
  { label: m.messaging.title, href: routes.conversations() },
  { label: m.notebook.title, href: routes.notebook() },
  { label: m.humidor.title, href: routes.humidor() },
  { label: m.statistics.title, href: routes.statistics() },
  { label: m.contributions.eyebrow, href: routes.contributions() },
  { label: m.settings.title, href: routes.settings() },
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

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <Link href={routes.home()} className="font-display text-ink text-2xl leading-none">
          {BRAND.name}
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {[...NAV, ...(user ? MEMBER_NAV : [])].map((item) => (
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
