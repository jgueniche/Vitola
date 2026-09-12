import { Search } from 'lucide-react'
import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { SiteMenu, type MenuLink } from '@/components/layout/site-menu'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { FACET_PARAMS } from '@/lib/search/facets'
import { getRole } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { countUnreadNotifications } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

/*
 * One line, six words, and a menu under `lg`.
 *
 * The four universes of P0 are gone. The QA session of 12 septembre 2026
 * removed three of them by name — « page découvrir ça saute », « supprimer le
 * autour », « au lieu de chez moi tu split : ma cave, mon carnet » — and what
 * remains is flat because it is short enough to be flat. A hub page whose only
 * content was six links to real pages was a click charged for nothing.
 *
 * What a VISITOR sees is the three sections the same session listed as the
 * signed-out site: the shop, the cigars, the partners. The member's four are
 * added, not substituted, so nothing moves when one signs in.
 *
 * Neither the shop nor the partners entry reads a flag, and that is a measured
 * decision inherited from P5: a flag in the header is a query on every page of
 * the site. `shop_enabled` and `venues_enabled` remain the kill switches —
 * pulling one 404s the section behind its link, and each flag's description
 * says so.
 */
const VISITOR_NAV = [
  { label: m.nav.shop.label, href: routes.shop() },
  { label: m.nav.cigars.label, href: routes.cigars() },
  { label: m.nav.partners.label, href: routes.venues() },
] as const

/* Their sections all bounce a visitor to the sign-in page, and a nav entry
   whose one behaviour is to bounce you is a promise it cannot keep. */
const MEMBER_NAV = [
  { label: m.nav.notebook.label, href: routes.notebook() },
  { label: m.nav.humidor.label, href: routes.humidor() },
  { label: m.nav.suggestions.label, href: routes.suggestions() },
  { label: m.nav.circle.label, href: routes.hubCircle() },
] as const

/**
 * Rendered inside app/(app)/ — which since the shop opened also serves pages a
 * visitor reaches WITHOUT the gate (/boutique). Reading the session here is
 * still free: every route under it is dynamic, and the landing page keeps its
 * own header.
 *
 * The search field is a GET form and nothing else — the same shape as the
 * search on /cigares, whose `q` it fills. No JavaScript, no suggestions: a
 * query is a URL, and the list page is where the facets live. Under `lg` it
 * moves into the menu rather than taking a line of its own, which is what made
 * the old header three lines tall on a phone.
 */
export async function SiteHeader() {
  const user = await currentUser()
  /* A head count, so the badge costs no rows on every page of the site. Zero
     for a visitor without asking: `notifications_select_own` would answer
     nothing anyway, and a query per anonymous page view to learn that is a
     query too many. */
  const [unread, role] = user
    ? await Promise.all([countUnreadNotifications(), getRole(user.id)])
    : [0, 'member' as const]
  const isAdmin = hasMinRole(role, 'admin')

  const nav = user ? [...VISITOR_NAV, ...MEMBER_NAV] : [...VISITOR_NAV]

  /* The menu carries the same sections plus the account rail, because on a
     phone there is nowhere else for the account rail to be. */
  const trailing: MenuLink[] = [
    ...(user
      ? [
          {
            label: unread > 0 ? `${m.notifications.eyebrow} (${unread})` : m.notifications.eyebrow,
            href: routes.notifications(),
          },
          { label: m.settings.title, href: routes.settings() },
        ]
      : [{ label: m.auth.title, href: routes.signIn(), accent: true }]),
    ...(isAdmin ? [{ label: m.nav.admin.label, href: routes.admin(), accent: true }] : []),
  ]

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4 py-3.5">
        <Link href={routes.home()} className="wordmark text-ink mr-auto">
          {BRAND.name}
        </Link>

        <nav aria-label={m.nav.mainLabel} className="hidden lg:block">
          <ul className="flex items-center gap-x-6 text-sm">
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
          </ul>
        </nav>

        <form
          action={routes.cigars()}
          method="get"
          role="search"
          className="hidden w-44 lg:block xl:w-52"
        >
          <label htmlFor="recherche-en-tete" className="sr-only">
            {m.nav.searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              strokeWidth={1.5}
              className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <input
              id="recherche-en-tete"
              type="search"
              name={FACET_PARAMS.query}
              placeholder={m.referential.search.placeholder}
              className="border-rule bg-surface text-ink placeholder:text-ink-muted focus:border-accent rounded-band h-9 w-full border pr-2.5 pl-8 text-sm outline-none"
            />
          </div>
        </form>

        {/* The account rail, on a desk. Everything here is a word or an icon,
            never both: the header is read once and then ignored. */}
        <div className="hidden items-center gap-x-4 text-sm lg:flex">
          {user ? (
            <Link
              href={routes.notifications()}
              className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 transition-colors duration-(--duration-quick)"
            >
              {m.notifications.eyebrow}
              {unread > 0 ? (
                <span className="border-accent text-accent rounded-band border px-1.5 text-xs tabular-nums">
                  {unread}
                </span>
              ) : null}
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href={routes.admin()}
              className="border-accent text-accent hover:text-accent-bright rounded-band border px-2 py-0.5 transition-colors duration-(--duration-quick)"
            >
              {m.nav.admin.label}
            </Link>
          ) : null}
          {user ? (
            <Link
              href={routes.settings()}
              className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
            >
              {m.settings.title}
            </Link>
          ) : null}
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
        </div>

        <ThemeToggle className="ml-auto lg:ml-0" />
        <SiteMenu links={nav.map((item) => ({ ...item }))} trailing={trailing} />
      </div>
    </header>
  )
}
