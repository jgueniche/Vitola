'use client'

// useState + usePathname, for the reason SiteMenu gives: a disclosure holds
// whether it is open, and the app layout survives navigation, so it has to be
// told to close when the page under it changes.
import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { m } from '@/lib/i18n'

const copy = m.nav.account

export type AccountLink = { label: string; href: string; badge?: number; accent?: boolean }

/**
 * The account, behind one mark in the corner.
 *
 * QA of 14 septembre 2026: « Notifications / Mon compte / Se déconnecter …
 * cette partie là dans le header n'a rien à faire là ». Four controls of the
 * same weight as the four sections beside them, so the header read as eight
 * destinations with no hierarchy — and « se déconnecter » sat in the row a
 * reader scans for where to go next.
 *
 * It is a disclosure, not a modal, and for the same reasons SiteMenu is one:
 * no focus trap, no scroll lock, no portal. The panel is the next thing in the
 * document after the button, so Tab walks into it and Shift+Tab walks back out.
 * Unlike SiteMenu it OVERLAYS rather than pushes, because the header is one
 * line and pushing the page down to reach « se déconnecter » would be the
 * three-line header the same QA removed — so it closes on Escape and on a
 * pointer outside it, which a pushing panel does not need.
 *
 * The initials are drawn, never fetched: no avatar upload exists, and a
 * placeholder image would promise one. Two letters from the display name is
 * what the site already knows about someone.
 */
export function AccountMenu({
  initials,
  label,
  email,
  links,
  footer,
}: {
  initials: string
  /** The accessible name — the display name, the handle, or the address. */
  label: string
  email: string | null
  links: AccountLink[]
  /** The sign-out control: a POST form, owned by the server. */
  footer?: ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(pathname)
  const root = useRef<HTMLDivElement>(null)

  /* Reconciled DURING render, never in an effect: `react-hooks/set-state-in-effect`
     refuses the effect, and React documents this. */
  if (seen !== pathname) {
    setSeen(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    /* `pointerdown` rather than `click`: a click that lands on a link inside
       the panel must not close it before the navigation starts. */
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const unread = links.reduce((total, link) => total + (link.badge ?? 0), 0)

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-du-compte"
        onClick={() => setOpen((value) => !value)}
        className="text-header-ink-muted hover:text-header-ink inline-flex items-center gap-1 transition-colors duration-(--duration-quick)"
      >
        <span
          aria-hidden="true"
          className="border-header-rule text-header-ink relative inline-flex size-8 items-center justify-center rounded-full border bg-transparent text-xs font-medium tracking-wide"
        >
          {initials}
          {/* The unread count, when the panel is shut and the reader cannot
              see the line that carries it. A dot, not a number: the number is
              one press away and a badge over a 32px circle is unreadable. */}
          {unread > 0 ? (
            <span className="bg-header-accent border-header absolute -top-0.5 -right-0.5 size-2.5 rounded-full border" />
          ) : null}
        </span>
        <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
        <span className="sr-only">
          {open ? copy.close : copy.open} — {label}
          {unread > 0 ? ` · ${copy.unread.replace('{count}', String(unread))}` : ''}
        </span>
      </button>

      <div
        id="menu-du-compte"
        hidden={!open}
        className="border-rule bg-surface absolute top-full right-0 z-30 mt-2 w-60 rounded-[3px] border shadow-lg"
      >
        <p className="border-rule text-ink-faint truncate border-b px-3.5 py-2.5 text-xs">
          {email ?? label}
        </p>
        <nav aria-label={copy.menuLabel}>
          <ul className="flex flex-col py-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`hover:bg-surface-raised flex items-center justify-between gap-3 px-3.5 py-2 text-sm transition-colors duration-(--duration-quick) ${
                    link.accent ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {link.label}
                  {link.badge ? (
                    <span className="border-accent text-accent rounded-band border px-1.5 text-xs tabular-nums">
                      {link.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {footer ? <div className="border-rule border-t px-3.5 py-2">{footer}</div> : null}
      </div>
    </div>
  )
}
