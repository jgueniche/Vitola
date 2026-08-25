import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { getRole } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { getMyVendor } from '@/lib/shop/queries'
import { countUnreadNotifications } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

/*
 * Four universes, not seventeen entries — plus the shop.
 *
 * The flat nav grew one link per delivered phase until it stopped being a map
 * of anything. Each entry is now a universe whose hub lists its sections with
 * a sentence each. The shop is the deliberate exception since the owner's
 * decision of 25 août 2026: it leads the nav as a STATIC entry, no flag read
 * (the venues lesson — a flag in the header is a query on every page). Its
 * resting state is open (migration 0023); `shop_enabled` remains the
 * emergency kill-switch, and pulling it 404s behind this link until it is
 * reopened — the flag's own description says so.
 */
const NAV = [
  { label: m.nav.shop.label, href: routes.shop() },
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
 * Rendered inside app/(app)/ — which since the shop opened also serves pages
 * a visitor reaches WITHOUT the gate (/boutique). Reading the session here is
 * still free: every route under it is dynamic, and the landing page keeps its
 * own header.
 *
 * For a signed-in member the header also reads their role and vendor
 * attachment — two indexed single-row reads. That reverses an earlier
 * economy («the link lives in /parametres, where the role is already
 * loaded»): measured against QA feedback, an admin unable to FIND the shop
 * administration costs more than two point reads per page. Anonymous pages
 * pay nothing new.
 */
export async function SiteHeader() {
  const user = await currentUser()
  /* A head count, so the badge costs no rows on every page of the site. Zero
     for a visitor without asking: `notifications_select_own` would answer
     nothing anyway, and a query per anonymous page view to learn that is a
     query too many. */
  const [unread, role, vendor] = user
    ? await Promise.all([countUnreadNotifications(), getRole(user.id), getMyVendor(user.id)])
    : [0, 'member' as const, null]
  const isAdmin = hasMinRole(role, 'admin')

  const nav = user ? [NAV[0], NAV[1], MEMBER_NAV[0], MEMBER_NAV[1], NAV[2]] : [...NAV]

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
            {vendor ? (
              <li>
                <Link
                  href={routes.vendorSpace()}
                  className="border-accent text-accent hover:text-accent-bright rounded-[3px] border px-2 py-0.5 transition-colors duration-(--duration-quick)"
                >
                  {m.nav.vendor.label}
                </Link>
              </li>
            ) : null}
            {isAdmin ? (
              <li>
                <Link
                  href={routes.admin()}
                  className="border-accent text-accent hover:text-accent-bright rounded-[3px] border px-2 py-0.5 transition-colors duration-(--duration-quick)"
                >
                  {m.nav.admin.label}
                </Link>
              </li>
            ) : null}
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
