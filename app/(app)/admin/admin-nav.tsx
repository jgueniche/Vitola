// usePathname — a server layout cannot know which of its children renders,
// and the current screen must read as current (aria-current + weight).
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

const copy = m.admin.nav

/**
 * One bar on every /admin screen. Born from QA feedback on the marketplace:
 * five screens reachable only through small text links meant nobody FOUND
 * the shop administration. Links, nothing else — what each screen may do is
 * still decided by its policies, never by a nav entry (ADR 0014).
 */
const ENTRIES = [
  { label: copy.dashboard, href: routes.admin(), exact: true },
  { label: copy.shop, href: routes.adminShop(), exact: true },
  { label: copy.vendors, href: routes.adminShopVendors(), exact: false },
  { label: copy.flags, href: routes.adminFlags(), exact: false },
  { label: copy.accounts, href: routes.adminAccounts(), exact: false },
  { label: copy.sheets, href: routes.adminSheets(), exact: false },
  { label: copy.lines, href: routes.adminLines(), exact: false },
] as const

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label={copy.label} className="border-rule bg-surface border-b">
      <ul className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-sm">
        {ENTRIES.map((entry) => {
          const active = entry.exact
            ? pathname === entry.href
            : pathname === entry.href || pathname.startsWith(`${entry.href}/`)
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'text-accent font-semibold'
                    : 'text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)'
                }
              >
                {entry.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
