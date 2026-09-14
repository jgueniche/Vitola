import Link from 'next/link'

import { ThemeToggle } from '@/components/layout/theme-toggle'

import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * The header of the pages in front of the gate.
 *
 * It is NOT in the `(public)` layout, and that is deliberate: the age gate and
 * the legal pages stay bare — a visitor being asked for a date of birth does
 * not need a navigation bar offering six other places to go. It is opted into,
 * page group by page group.
 *
 * Two entries, on purpose. Everything behind the gate is one door, « Entrer »;
 * the shop is the one place a visitor can walk into from here without a date
 * of birth (owner's decision, 25 août 2026), so it is the one real link. The
 * in-page anchors this header used to carry pointed at sections the page no
 * longer has — the landing was rebuilt sober on 6 septembre 2026.
 *
 * ## Why the journal needed it (14 septembre 2026)
 *
 * Found while writing the audit's mobile pass: only `app/(app)/layout.tsx`
 * carried a header, so every page of `app/(public)/` had no menu, no search and
 * **not even the wordmark**. On `/majorite` that is right. On the journal it was
 * not: ADR 0012 makes it « le seul préfixe public du site » and the indexing
 * lever, so a reader arriving on an article from a search engine had NO path to
 * the rest of the site — not a hard one, none. So the wordmark becomes a link
 * when the reader is not already home, and the journal's own index is named,
 * because an article's neighbour is another article.
 *
 * §2 holds without an exception: a wordmark, the shop, the journal and a door.
 * No brand, no product, no price.
 */
export function PublicHeader({
  /** True on `/` itself: a link to the page you are on is a dead control. */
  atHome = false,
  /** True inside the journal: its index is then a sibling worth naming. */
  inJournal = false,
}: {
  atHome?: boolean
  inJournal?: boolean
}) {
  return (
    <header className="bg-header border-header-rule text-header-ink border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4">
        {atHome ? (
          <span className="wordmark text-header-ink">{BRAND.name}</span>
        ) : (
          <Link href={routes.home()} className="wordmark text-header-ink">
            {BRAND.name}
          </Link>
        )}

        <nav aria-label={m.landing.nav.label} className="flex items-center gap-4 text-sm sm:gap-6">
          <ThemeToggle className="text-header-ink-muted hover:text-header-ink" />
          {inJournal ? null : (
            <Link
              href={routes.journal()}
              className="text-header-ink-muted hover:text-header-ink text-xs font-medium tracking-[0.08em] uppercase transition-colors duration-(--duration-quick)"
            >
              {m.journal.title}
            </Link>
          )}
          <Link
            href={routes.shop()}
            className="text-header-ink-muted hover:text-header-ink text-xs font-medium tracking-[0.08em] uppercase transition-colors duration-(--duration-quick)"
          >
            {m.landing.nav.shop}
          </Link>
          <Link
            href={routes.ageGate()}
            className="bg-header-accent text-on-header-accent hover:bg-accent-bright rounded-band inline-flex h-9 items-center px-4 text-sm font-medium transition-colors duration-(--duration-quick)"
          >
            {m.home.enter}
          </Link>
        </nav>
      </div>
    </header>
  )
}
