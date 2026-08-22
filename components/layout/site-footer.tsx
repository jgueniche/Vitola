import Link from 'next/link'

import { BRAND } from '@/lib/brand'
import { routes } from '@/lib/routes'

const LEGAL = [
  { label: 'Mentions légales', href: routes.legalNotice() },
  { label: 'Confidentialité', href: routes.privacy() },
  { label: 'Conditions', href: routes.terms() },
  { label: 'Cookies', href: routes.cookies() },
  { label: 'Santé', href: routes.health() },
] as const

export function SiteFooter() {
  return (
    <footer className="border-rule mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8">
        <nav aria-label="Informations légales">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {LEGAL.map((item) => (
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
        {/* Required by §2: the site informs, it does not sell. */}
        <p className="text-ink-muted text-xs">{BRAND.disclaimer}</p>
      </div>
    </footer>
  )
}
