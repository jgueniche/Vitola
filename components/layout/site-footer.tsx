import Link from 'next/link'

import { Cepo } from '@/components/brand/cepo'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

const copy = m.legal

/* Short forms, not the page titles: a footer row is read at a glance. They are
   messages because they were French literals until the English build. */
const LEGAL = [
  { label: copy.footerNotice, href: routes.legalNotice() },
  { label: copy.footerPrivacy, href: routes.privacy() },
  { label: copy.footerTerms, href: routes.terms() },
  { label: copy.footerCookies, href: routes.cookies() },
  { label: copy.footerHealth, href: routes.health() },
] as const

export function SiteFooter() {
  return (
    <footer className="border-rule mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8">
        <nav aria-label={copy.footerLabel}>
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
        {/* Required by §2: the site informs, it does not sell. The mark
            signs it — in one ink, because a brass ring at the foot of a page
            would ask for attention the sentence beside it does not want. */}
        <div className="flex items-center gap-3">
          <Cepo size={28} ring="stroke-ink-faint" initial="fill-ink-faint" />
          <p className="text-ink-muted text-xs">{BRAND.disclaimer}</p>
        </div>
      </div>
    </footer>
  )
}
