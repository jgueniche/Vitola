'use client'

// useState + usePathname: a drawer holds whether it is open, and the app
// layout survives navigation — so it has to be told to close when the page
// under it changes. There is no other way to know.
import { Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { FACET_PARAMS } from '@/lib/search/facets'

const copy = m.nav

export type MenuLink = { label: string; href: string; accent?: boolean }

/**
 * The narrow-screen menu — the thing the site did not have.
 *
 * QA of 12 septembre 2026: « pas de menu ». The header used to lay its
 * wordmark, its search field and its seven links out as a wrapping flex row,
 * which on a phone was three lines of chrome above every page and no way to
 * reach the sections that did not fit.
 *
 * It is a disclosure, not a modal: no focus trap, no scroll lock, no portal.
 * The panel is the next thing in the document after the button, so Tab walks
 * into it and Shift+Tab walks back out, which is what a screen reader user and
 * a keyboard user both expect from something that pushes the page down rather
 * than covering it.
 *
 * The pathname is mirrored in state and reconciled DURING render, never in an
 * effect: `react-hooks/set-state-in-effect` refuses the effect, and React
 * documents the render-time reconciliation. Without it the panel stays open
 * over the page you just navigated to.
 */
export function SiteMenu({ links, trailing }: { links: MenuLink[]; trailing?: MenuLink[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(pathname)

  if (seen !== pathname) {
    setSeen(pathname)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-du-site"
        onClick={() => setOpen((value) => !value)}
        className="text-ink-muted hover:text-ink -mr-2 inline-flex size-9 items-center justify-center transition-colors duration-(--duration-quick) lg:hidden"
      >
        {open ? (
          <X aria-hidden="true" strokeWidth={1.5} className="size-5" />
        ) : (
          <Menu aria-hidden="true" strokeWidth={1.5} className="size-5" />
        )}
        <span className="sr-only">{open ? copy.menu.close : copy.menu.open}</span>
      </button>

      <div
        id="menu-du-site"
        hidden={!open}
        className="border-rule basis-full border-t pt-4 pb-1 lg:hidden"
      >
        <form action={routes.cigars()} method="get" role="search" className="pb-3">
          <label htmlFor="recherche-menu" className="sr-only">
            {copy.searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              strokeWidth={1.5}
              className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id="recherche-menu"
              type="search"
              name={FACET_PARAMS.query}
              placeholder={m.referential.search.placeholder}
              className="border-rule bg-surface text-ink placeholder:text-ink-muted focus:border-accent rounded-band h-10 w-full border pr-3 pl-9 text-sm outline-none"
            />
          </div>
        </form>

        <nav aria-label={copy.menu.label}>
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href} className="border-rule border-t">
                <Link
                  href={link.href}
                  className={`block py-3 text-sm ${link.accent ? 'text-accent' : 'text-ink'}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {(trailing ?? []).map((link) => (
              <li key={link.href} className="border-rule border-t">
                <Link
                  href={link.href}
                  className={`block py-3 text-sm ${link.accent ? 'text-accent' : 'text-ink-muted'}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
