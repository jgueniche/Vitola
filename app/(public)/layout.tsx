import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/layout/site-footer'

/**
 * Routes reachable WITHOUT clearing the age gate.
 * No product content, no cigar name, no image of tobacco may appear here.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}
