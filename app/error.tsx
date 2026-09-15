'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

const copy = m.common

/**
 * Global error boundary. Sober tone, no apology theatre, no "Oops" (§4.6).
 * The error message itself is never shown: it can leak internals.
 *
 * ## Why there are two links under the retry button
 *
 * The open question of ADR 0020, arbitrated on 15 septembre 2026. This screen
 * is what a reader gets when the SUBJECT of a page could not be read — the
 * « site blanc » the owner saw on 14 septembre — and until now it offered
 * exactly one way out: try the same page again. Somebody whose page is down
 * had no path to the rest of the site but the address bar. The same week had
 * already fixed that exact gap for the journal, for the same reason.
 *
 * Three options were on the table. Keeping the site's header here (a) was
 * rejected on a measurement rather than a taste: **the header reads the
 * database three times on every signed-in page**, so the error screen would
 * be able to fail for the very reason it is being shown. What it gained in
 * navigation it would lose in reliability, at the worst possible moment.
 *
 * So: the screen stays bare, and gains two links that **read nothing**.
 * Both destinations are chosen by the same measurement, not by taste — the
 * landing page makes **zero** round trips (it is prerendered) and the journal
 * makes **one**, the two cheapest pages on the site. The landing is the only
 * page that cannot fail for the reason that brought the reader here.
 *
 * `routes` and `m` are pure module reads; nothing on this screen awaits
 * anything. That property is the whole point, and it is what to preserve if
 * this screen is ever edited.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
      <p className="eyebrow">{copy.errorEyebrow}</p>
      <h1 className="font-display text-display-md">{copy.errorTitle}</h1>
      <p className="text-ink-muted measure">{copy.errorBody}</p>
      <div className="flex flex-col gap-5">
        <div>
          <Button onClick={reset}>{copy.errorRetry}</Button>
        </div>
        <p className="text-ink-muted flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Link
            href={routes.home()}
            className="hover:text-ink underline underline-offset-4 transition-colors duration-(--duration-quick)"
          >
            {m.nav.trail.home}
          </Link>
          <Link
            href={routes.journal()}
            className="hover:text-ink underline underline-offset-4 transition-colors duration-(--duration-quick)"
          >
            {m.journal.title}
          </Link>
        </p>
      </div>
    </main>
  )
}
