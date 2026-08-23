import Link from 'next/link'

import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * The landing page's own header.
 *
 * It lives here rather than in the (public) layout because the legal pages and
 * the age gate must stay bare — a visitor being asked for a date of birth does
 * not need a navigation bar offering him six other places to go.
 *
 * The background is opaque, not frosted: backdrop-filter does not render
 * everywhere, and where it fails a translucent bar leaves the section titles
 * legible straight through the navigation.
 *
 * Every nav item is an in-page anchor, deliberately. Linking "Cigares" to
 * /cigares from a page seen BEFORE the gate would promise a destination the
 * middleware immediately refuses; the section below is the honest answer to
 * the same question.
 */

const NAV = [
  { label: m.landing.nav.cigars, href: '#referentiel' },
  { label: m.landing.nav.brands, href: '#referentiel' },
  { label: m.landing.nav.vitolas, href: '#referentiel' },
  { label: m.landing.nav.venues, href: '#lieux' },
  { label: m.landing.nav.journal, href: '#reseau' },
  { label: m.landing.nav.shop, href: '#boutique' },
] as const

export function LandingHeader() {
  return (
    <header className="border-rule bg-ground sticky top-0 z-20 border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <span className="font-display text-ink text-2xl leading-none">{BRAND.name}</span>

        {/* Its own label: the hero's table of contents already carries
            `tocTitle`, and two landmarks with the same name are one landmark a
            screen-reader user cannot tell apart. */}
        <nav aria-label={m.landing.hero.tocShortcuts} className="flex items-center gap-5">
          <ul className="hidden items-center gap-x-5 text-sm lg:flex">
            {NAV.map((item, index) => (
              <li key={`${item.href}-${index}`}>
                <a
                  href={item.href}
                  className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href={routes.ageGate()}
            className="bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-10 items-center px-4 text-sm font-medium transition-colors duration-(--duration-quick)"
          >
            {m.home.enter}
          </Link>
        </nav>
      </div>
    </header>
  )
}
