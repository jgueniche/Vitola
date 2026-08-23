import { m } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const copy = m.contributions

export type RevisionStatus = 'pending' | 'approved' | 'rejected'

/**
 * Where a proposal stands, in three words and one colour.
 *
 * Its own file rather than an export from a `page.tsx`: a route module that
 * other routes import is a dependency Next has no reason to keep stable, and it
 * reads as an accident to whoever finds it next.
 */
export function StatusBadge({ status }: { status: RevisionStatus }) {
  const label =
    status === 'approved'
      ? copy.statusApproved
      : status === 'rejected'
        ? copy.statusRejected
        : copy.statusPending

  return (
    <span
      className={cn(
        'eyebrow',
        status === 'approved' && 'text-accent',
        status === 'rejected' && 'text-negative',
        status === 'pending' && 'text-ink-muted',
      )}
    >
      {label}
    </span>
  )
}
