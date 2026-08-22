import Link from 'next/link'

import { BRAND } from '@/lib/brand'
import { routes } from '@/lib/routes'

const NAV = [
  { label: 'Cigares', href: routes.cigars() },
  { label: 'Marques', href: routes.brands() },
  { label: 'Vitoles', href: routes.vitolas() },
  { label: 'Lieux', href: routes.venues() },
  { label: 'Journal', href: routes.journal() },
  { label: 'Boutique', href: routes.shop() },
] as const

export function SiteHeader() {
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
          </ul>
        </nav>
      </div>
    </header>
  )
}
