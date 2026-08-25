import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'

/**
 * Routes behind the age gate — with one carved-out exception. The middleware
 * guarantees a valid signed cookie before any of these render, and stamps
 * `X-Robots-Tag: noindex` on the response.
 *
 * The exception is /boutique (owner's decision, 25 août 2026): the shop and
 * its checkout are in PUBLIC_PATHS/PUBLIC_PREFIXES, so the middleware lets an
 * ungated visitor through. It stays in this group because it wants the same
 * chrome — the header degrades cleanly for a visitor (no member links, a
 * sign-in entry), and the shop's own layout adds its demo banner.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}
