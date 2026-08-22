import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'

/**
 * Routes behind the age gate. The middleware guarantees a valid signed cookie
 * before any of these render, and stamps `X-Robots-Tag: noindex` on the response.
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
