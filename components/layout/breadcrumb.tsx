import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { m } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const copy = m.nav.trail

export type Crumb = { label: string; href: string }

/**
 * Where you are, and the way back out.
 *
 * The QA session of 12 septembre 2026: « pas de menu pas de retour pour partir
 * en arrière : il faut rajouter la fonctionnalité de retour / arborescence
 * pourquoi pas de partout ». The site had neither. Deep pages — an entry, a
 * lot, a venue, a moderation file — were reachable in one click and left only
 * by the browser's own button, which on a phone is a gesture people do not all
 * know and which loses a scroll position.
 *
 * The last crumb is the page itself and is NOT a link: a link to where you
 * already are is a dead control, and a screen reader announces it as a choice.
 * `aria-current="page"` says which one it is.
 *
 * On a phone the whole trail would wrap to three lines, so only the last hop
 * shows, with its chevron — that is the "retour" half of the ask. From `sm`
 * the full path shows, which is the "arborescence" half. One component, both
 * answers, no duplicated markup.
 */
export function Breadcrumb({ trail, className }: { trail: Crumb[]; className?: string }) {
  if (trail.length === 0) return null

  const parent = trail[trail.length - 1]
  if (!parent) return null

  return (
    <nav aria-label={copy.label} className={cn('text-sm', className)}>
      {/* The phone answer: one hop back, with the affordance in front of it. */}
      <Link
        href={parent.href}
        className="text-ink-muted hover:text-ink -ml-1 inline-flex items-center gap-1 transition-colors duration-(--duration-quick) sm:hidden"
      >
        <ChevronLeft aria-hidden="true" strokeWidth={1.5} className="size-4" />
        {parent.label}
      </Link>

      {/* The desk answer: the whole path. */}
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 sm:flex">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-ink-faint">
                /
              </span>
            ) : null}
            <Link
              href={crumb.href}
              className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
            >
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * The trail plus the page you are on — for a page deep enough that naming
 * itself helps, such as one entry among many.
 */
export function BreadcrumbWithCurrent({
  trail,
  current,
  className,
}: {
  trail: Crumb[]
  current: string
  className?: string
}) {
  return (
    <nav aria-label={copy.label} className={cn('text-sm', className)}>
      <Link
        href={trail[trail.length - 1]?.href ?? '/'}
        className="text-ink-muted hover:text-ink -ml-1 inline-flex items-center gap-1 transition-colors duration-(--duration-quick) sm:hidden"
      >
        <ChevronLeft aria-hidden="true" strokeWidth={1.5} className="size-4" />
        {trail[trail.length - 1]?.label ?? copy.home}
      </Link>

      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 sm:flex">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-ink-faint">
                /
              </span>
            ) : null}
            <Link
              href={crumb.href}
              className="text-ink-muted hover:text-ink transition-colors duration-(--duration-quick)"
            >
              {crumb.label}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="text-ink-faint">
            /
          </span>
          <span aria-current="page" className="text-ink-faint">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  )
}
