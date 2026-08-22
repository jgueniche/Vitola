import Link from 'next/link'

import { signOut } from '@/app/(public)/connexion/actions'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
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
] as const

/**
 * Rendered only inside app/(app)/, never on the public side — which is why
 * reading the session here is free: those routes are already dynamic, and the
 * landing page stays static and cacheable for the SEO target of Q13.
 */
export async function SiteHeader() {
  const user = await currentUser()

  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <Link href={routes.home()} className="font-display text-ink text-2xl leading-none">
          {BRAND.name}
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
                >
                  {item.label}
                </Link>
              </li>
            ))}
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
