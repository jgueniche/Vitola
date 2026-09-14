import type { ReactNode } from 'react'

import { PublicHeader } from '@/components/layout/public-header'

/**
 * The journal's own chrome, and the reason it is here rather than one level up.
 *
 * ADR 0012 makes `/journal` « le seul préfixe public du site » and the lever of
 * indexing. Until 14 septembre 2026 it had no header at all — only
 * `app/(app)/layout.tsx` carried one — so a reader arriving on an article from
 * a search engine had no path to the rest of the site, not even the wordmark.
 * Found while writing the mobile pass of the accessibility audit, which asked
 * for a menu here and correctly reported there was none.
 *
 * NOT in `app/(public)/layout.tsx`, because that layout also serves
 * `/majorite` and the legal pages, and those stay bare on purpose: somebody
 * being asked for a date of birth is not offered six other places to go.
 *
 * `inJournal` drops the journal's own entry — a link to the section you are
 * reading is a dead control, the same reason the last crumb of a breadcrumb is
 * never a link.
 */
export default function JournalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader inJournal />
      {children}
    </>
  )
}
