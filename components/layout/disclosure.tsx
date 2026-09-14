import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A fold, in native HTML, closed by default.
 *
 * QA of 13 septembre 2026: « le reste doit être sous forme de menu déroulant,
 * ça gâche trop l'expérience sur mobile avec trop de défilement vertical ». A
 * cigar sheet held twenty-odd facts in one column, and eighteen of them were
 * between the reader and anything they could act on.
 *
 * `<details>` rather than a client component, and the reasons are not
 * stylistic:
 *
 *   - **zero JavaScript.** The referential zone of a sheet has none, and a fold
 *     is not a good enough reason to give it some.
 *   - **zero layout shift.** A component that reads the viewport to decide its
 *     initial state renders closed on the server and opens after hydration,
 *     which is a CLS regression on the page P8 measured at 0.
 *   - **the open state survives a Server Action.** React does not manage the
 *     `open` attribute unless it is passed, so `revalidatePath` re-rendering the
 *     page around it leaves the fold as the reader left it — which is exactly
 *     what `app/CLAUDE.md` warns a `useState` panel does NOT do.
 *
 * A line, not a card (rules of 6 septembre): a rule above, the summary on it,
 * and the content indented by nothing. `aside` gives it its own label so a
 * screen reader can skip the group whole.
 */
export function Disclosure({
  title,
  hint,
  children,
  className,
}: {
  title: string
  /** Shown next to the title, in the summary — what is inside, or what is missing. */
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <details className={cn('border-rule group border-t', className)}>
      <summary className="text-ink hover:text-accent flex cursor-pointer list-none items-baseline gap-2 py-3 text-sm transition-colors duration-(--duration-quick) [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.5}
          className="mt-0.5 size-4 shrink-0 transition-transform duration-(--duration-quick) group-open:rotate-180"
        />
        <span className="font-medium">{title}</span>
        {hint ? <span className="text-ink-faint text-xs">{hint}</span> : null}
      </summary>
      <div className="pt-1 pb-5">{children}</div>
    </details>
  )
}
