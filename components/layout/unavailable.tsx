import { m } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const copy = m.common.unavailable

/**
 * What an accessory read renders when it did not come back (ADR 0020).
 *
 * The « en le disant » half of the rule, and the half that is not optional.
 * An accompaniment that fails silently is indistinguishable from an
 * accompaniment that is legitimately empty, and on four of this site's tables
 * empty is the ordinary state — so silence would tell the reader « there is
 * nothing here » on behalf of a database that was never asked.
 *
 * A line, never a card: the design audit of 6 septembre 2026 put an empty
 * state between two hairlines, and a failure is an empty state with a reason.
 * It carries no retry button — the page reloads, and a control that re-fires
 * one query while the rest of the screen stays stale would promise a
 * granularity the page does not have.
 *
 * `label` names WHAT is missing when the surrounding heading does not already:
 * « Les origines » reads better than a bare notice under a facet panel whose
 * title the reader has already passed.
 */
export function Unavailable({ label, className }: { label?: string; className?: string }) {
  return (
    <p
      role="status"
      className={cn('border-rule text-ink-faint border-l-2 py-1 pl-3 text-sm', className)}
    >
      {label ? `${label} — ${copy.body}` : copy.body}
    </p>
  )
}
