import { m } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * What a page shows between the click and its content (ADR 0021).
 *
 * Until 15 septembre 2026 the site had no loading boundary at all — grep
 * found neither `Suspense` nor `loading.tsx`. Every page under (app) is
 * dynamic, so a click on « Boutique » sent the browser to fetch the whole
 * page, and the router kept the OLD page on screen, unchanged, until the new
 * one had entirely arrived: 0.5 to 2 seconds during which nothing happened.
 * Measured from a real browser, not supposed. That silence is the latency
 * the QA session described; the server's part of it is a separate matter.
 *
 * A `loading.tsx` is a Suspense boundary the router can commit to at once:
 * the URL changes, the header stays, and this is drawn where the page will
 * be. It is a line, never a card (the design audit of 6 septembre 2026):
 * the shape of a page head, then the shape of a list between hairlines. No
 * copy but the one word a screen reader needs, because the skeleton is
 * replaced too quickly to read.
 *
 * `main#contenu` is here too, so the skip link has a target during the
 * transition and the page's own `main` takes over in place.
 */
export function LoadingSkeleton({
  width = 'max-w-4xl',
  rows = 4,
}: {
  /** The page container this stands in for: `max-w-3xl` … `max-w-6xl`. */
  width?: string
  rows?: number
}) {
  return (
    <main
      id="contenu"
      aria-busy="true"
      className={cn('mx-auto flex flex-col gap-8 px-4 py-12', width)}
    >
      <p role="status" className="sr-only">
        {m.common.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <div className="bg-surface-raised rounded-band h-3 w-24" />
        <div className="bg-surface-raised rounded-band h-8 w-72 max-w-full" />
      </div>
      <ul aria-hidden="true" className="border-rule border-t motion-safe:animate-pulse">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="border-rule flex items-center gap-4 border-b py-4">
            <div className="bg-surface-raised rounded-band h-3.5 w-40" />
            <div className="bg-surface-raised rounded-band h-3 w-24" />
          </li>
        ))}
      </ul>
    </main>
  )
}
