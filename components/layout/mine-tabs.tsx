import Link from 'next/link'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { cn } from '@/lib/utils'

const copy = m.nav

export type MineTab = 'notebook' | 'humidor' | 'suggestions' | 'statistics'

/**
 * The tab bar of what is yours — the notebook, the humidor, the suggestions,
 * the figures.
 *
 * « Au lieu de chez moi tu split : ma cave, mon carnet » removed the hub;
 * « page chez moi : mon carnet, et rajouter un onglet ma cave » says what
 * replaces it. Both are the same ask read from either end: two destinations
 * in the nav, and from each of them the other one is one click away.
 *
 * A server component, and the current tab is a prop rather than a
 * `usePathname()`: every page that renders this bar already knows which one it
 * is, and shipping a client component to learn what the server knew is the
 * trade `/admin` had to make only because its nav lives in a layout.
 *
 * The current tab is a `<span aria-current="page">`, not a link: a link to the
 * page you are on is a dead control.
 */
export function MineTabs({ current }: { current: MineTab }) {
  const tabs = [
    { key: 'notebook' as const, label: copy.notebook.label, href: routes.notebook() },
    { key: 'humidor' as const, label: copy.humidor.label, href: routes.humidor() },
    { key: 'suggestions' as const, label: copy.suggestions.label, href: routes.suggestions() },
    { key: 'statistics' as const, label: copy.cards.statistics.title, href: routes.statistics() },
  ]

  return (
    <nav aria-label={copy.account.label} className="border-rule border-b">
      <ul className="-mb-px flex flex-wrap gap-x-6">
        {tabs.map((tab) => {
          const active = tab.key === current
          return (
            <li key={tab.key}>
              {active ? (
                <span
                  aria-current="page"
                  className="border-accent text-ink inline-block border-b-2 pb-2.5 text-sm font-medium"
                >
                  {tab.label}
                </span>
              ) : (
                <Link
                  href={tab.href}
                  className={cn(
                    'text-ink-muted hover:text-ink inline-block border-b-2 border-transparent pb-2.5 text-sm',
                    'transition-colors duration-(--duration-quick)',
                  )}
                >
                  {tab.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
