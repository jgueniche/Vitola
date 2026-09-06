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
 * Two entries, on purpose. Everything behind the gate is one door, « Entrer »;
 * the shop is the one place a visitor can walk into from here without a date
 * of birth (owner's decision, 25 août 2026), so it is the one real link. The
 * in-page anchors the header used to carry pointed at sections the page no
 * longer has — the landing was rebuilt sober on 6 septembre 2026.
 */
export function LandingHeader() {
  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <span className="wordmark text-ink">{BRAND.name}</span>

        <nav aria-label={m.landing.nav.label} className="flex items-center gap-6 text-sm">
          <Link
            href={routes.shop()}
            className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
          >
            {m.landing.nav.shop}
          </Link>
          <Link
            href={routes.ageGate()}
            className="bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-9 items-center px-4 text-sm font-medium transition-colors duration-(--duration-quick)"
          >
            {m.home.enter}
          </Link>
        </nav>
      </div>
    </header>
  )
}
