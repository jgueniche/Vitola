import Link from 'next/link'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

const copy = m.common

/**
 * The 404, rendered outside every route group — so it has no header, no footer
 * and no locale of its own beyond the build's.
 *
 * Its copy was four French literals until the English build printed them under
 * `lang="en"`. Nothing here is worth a section of its own: a page that says a
 * page is missing belongs in `common`.
 */
export default function NotFound() {
  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
      <Band variant="divider" />
      <p className="eyebrow">{copy.notFoundEyebrow}</p>
      <h1 className="font-display text-display-md">{copy.notFoundTitle}</h1>
      <p className="text-ink-muted measure">{copy.notFoundBody}</p>
      <Link href={routes.home()} className="text-accent text-sm underline underline-offset-4">
        {copy.backHome}
      </Link>
    </main>
  )
}
