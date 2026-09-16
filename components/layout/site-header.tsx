import { Search } from 'lucide-react'
import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { Cepo } from '@/components/brand/cepo'
import { AccountMenu, type AccountLink } from '@/components/layout/account-menu'
import { SiteMenu, type MenuLink } from '@/components/layout/site-menu'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { BRAND } from '@/lib/brand'
import { accessory, orElse } from '@/lib/degrade'
import { initials } from '@/lib/format'
import { m } from '@/lib/i18n'
import { lockupRingSize, WORDMARK_FONT_SIZE } from '@/lib/mark'
import { routes } from '@/lib/routes'
import { FACET_PARAMS } from '@/lib/search/facets'
import { getHeaderIdentity } from '@/lib/settings/queries'
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
  /*
   * THREE states, not two — and the third is why this is wrapped (ADR 0020).
   *
   * `currentUser()` throws when it could not read the session, which is right
   * for a page whose subject depends on who is reading. The header is not
   * that: it is chrome on every page of the site, so letting it throw would
   * turn a provider hiccup into the error screen for the WHOLE app group,
   * including the pages that do not need a session at all. The blast radius
   * would be larger than the failure.
   *
   * So the header degrades — but it must not degrade into a lie. Rendering
   * « Se connecter » for an unreadable session claims the reader is signed
   * out, which is the same false statement about identity the rest of this
   * work exists to remove. The unknown state therefore shows NEITHER the
   * account menu NOR the sign-in word: it says the account could not be read,
   * and offers the visitor sections, which are the ones that work regardless.
   */
  const session = await accessory(currentUser())
  const user = session.ok ? session.value : null
  /* A head count, so the badge costs no rows on every page of the site. Zero
     for a visitor without asking: `notifications_select_own` would answer
     nothing anyway, and a query per anonymous page view to learn that is a
     query too many. */
  const [unreadRead, identityRead] = user
    ? await Promise.all([
        accessory(countUnreadNotifications()),
        accessory(getHeaderIdentity(user.id)),
      ])
    : [
        { ok: true, value: 0 } as const,
        { ok: true, value: { role: 'member' as const, displayName: null, handle: null } } as const,
      ]

  /* Both fall back CLOSED: no badge rather than a wrong count, and a plain
     member rather than an admin entry a failed read would have opened. */
  const unread = orElse(unreadRead, 0)
  const identity = orElse(identityRead, {
    role: 'member' as const,
    displayName: null,
    handle: null,
  })
  const isAdmin = hasMinRole(identity.role, 'admin')

  /* The name the corner wears, and the name a screen reader reads out. The
     address is the last resort because it is the one thing every account has. */
  const accountLabel =
    identity.displayName ?? (identity.handle ? `@${identity.handle}` : (user?.email ?? ''))
  /* Four destinations at most, each a DIFFERENT page: `m.settings.title` and
     `m.nav.account.label` are both « Mon compte » and both /parametres, so
     only one of them is here. The public profile is the second entry because
     it is the only other page that is about you rather than about the site. */
  const accountLinks: AccountLink[] = [
    { label: m.notifications.eyebrow, href: routes.notifications(), badge: unread },
    ...(identity.handle
      ? [{ label: m.nav.account.profile, href: routes.member(identity.handle) }]
      : []),
    { label: m.settings.title, href: routes.settings() },
    ...(isAdmin ? [{ label: m.nav.admin.label, href: routes.admin(), accent: true }] : []),
  ]

  const nav = user ? [...VISITOR_NAV, ...MEMBER_NAV] : [...VISITOR_NAV]
  /* The corner, in the third state. Not a link — there is nowhere honest to
     send someone whose identity we could not read. */
  const accountUnknown = !session.ok

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
      : !session.ok
        ? []
        : [{ label: m.auth.title, href: routes.signIn(), accent: true }]),
    ...(isAdmin ? [{ label: m.nav.admin.label, href: routes.admin(), accent: true }] : []),
  ]

  return (
    <header className="bg-header border-header-rule text-header-ink border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4 py-3.5">
        <Link
          href={routes.home()}
          className="text-header-ink mr-auto flex items-center gap-3"
        >
          {/* Same lockup as the public header, same ratio — see lib/mark.ts. */}
          <Cepo
            size={lockupRingSize(WORDMARK_FONT_SIZE)}
            ring="stroke-header-accent"
            initial="fill-header-ink"
          />
          <span className="wordmark">{BRAND.name}</span>
        </Link>

        <nav aria-label={m.nav.mainLabel} className="hidden lg:block">
          <ul className="flex items-center gap-x-4 text-sm xl:gap-x-5">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-header-ink-muted hover:text-header-ink text-xs font-medium tracking-[0.05em] whitespace-nowrap uppercase transition-colors duration-(--duration-quick)"
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
          className="hidden w-36 lg:block xl:w-48"
        >
          <label htmlFor="recherche-en-tete" className="sr-only">
            {m.nav.searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              strokeWidth={1.5}
              className="text-header-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <input
              id="recherche-en-tete"
              type="search"
              name={FACET_PARAMS.query}
              placeholder={m.referential.search.placeholder}
              className="border-header-rule text-header-ink placeholder:text-header-ink-muted focus:border-header-accent rounded-band h-9 w-full border bg-transparent pr-2.5 pl-8 text-sm outline-none"
            />
          </div>
        </form>

        {/* The account, on a desk: one mark, not four links. QA of
            14 septembre 2026 — « cette partie là dans le header n'a rien à
            faire là ». A visitor still gets a word, because « Se connecter »
            is the one thing we want them to read — unless we could not read
            the session at all, in which case neither word is true. */}
        <div className="hidden items-center gap-x-4 text-sm lg:flex">
          {accountUnknown ? (
            <span role="status" className="text-header-ink-muted text-xs">
              {m.nav.account.unavailable}
            </span>
          ) : user ? (
            <AccountMenu
              initials={initials({
                displayName: identity.displayName,
                handle: identity.handle,
                email: user.email ?? null,
              })}
              label={accountLabel}
              email={user.email ?? null}
              links={accountLinks}
              footer={
                /* A POST, not a link: signing out changes state, and a GET
                   that changes state gets fired by any link prefetcher that
                   passes. */
                <form action={signOut}>
                  <button
                    type="submit"
                    className="text-accent hover:text-accent-bright w-full py-1 text-left text-sm transition-colors duration-(--duration-quick)"
                  >
                    {m.auth.signOut}
                  </button>
                </form>
              }
            />
          ) : (
            <Link
              href={routes.signIn()}
              className="text-header-accent hover:text-header-ink text-xs font-medium tracking-[0.08em] uppercase transition-colors duration-(--duration-quick)"
            >
              {m.auth.title}
            </Link>
          )}
        </div>

        <ThemeToggle className="text-header-ink-muted hover:text-header-ink ml-auto lg:ml-0" />
        <SiteMenu
          links={nav.map((item) => ({ ...item }))}
          trailing={trailing}
          /* The sign-out control, which on a phone had nowhere to be: the
             account rail above is `hidden lg:flex`, and a POST cannot travel as
             a `MenuLink`. The address is shown with it because a phone is the
             device most likely to hold more than one account. */
          footer={
            user ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-header-ink-muted text-xs">
                  {user.email ? `${m.auth.signedInAs} · ${user.email}` : m.auth.signedInAs}
                </span>
                <form action={signOut}>
                  <button type="submit" className="text-header-accent py-2 text-sm">
                    {m.auth.signOut}
                  </button>
                </form>
              </div>
            ) : null
          }
        />
      </div>
    </header>
  )
}
