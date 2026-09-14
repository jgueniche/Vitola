import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * An empty state is an invitation, never a dead end (§4.6).
 * "Votre cave est vide. Scannez une bague ou cherchez une vitole pour commencer."
 *
 * A row between two hairlines, not a box. It used to be a bordered, centred
 * panel 96px tall — on thirty-one screens, sometimes three of them on one
 * page — and an empty list drew more attention than a full one. What is
 * empty says so in one line and offers the next step; it does not stage it.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      /*
       * Read by `tooling/audit/a11y.ts`, and it is the only reason it exists.
       *
       * Most screens of this site have an empty state and a populated one, and
       * the audit only ever sees the one the test account happens to be in.
       * That is how an invalid `<dl>` lived three weeks behind
       * `{nothingYet ? <EmptyState/> : …}` under a « 0 violation » banner
       * (docs/audit-2026-09-14.md). The audit cannot create fixtures — it
       * reads only — so the least it can do is SAY which of the two states it
       * looked at, and that requires the state to be visible from outside.
       */
      data-empty-state="true"
      className={cn('border-rule flex flex-col gap-1.5 border-t border-b py-4', className)}
    >
      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="lede">{description}</p>
      {action ? <div className="pt-1.5">{action}</div> : null}
    </div>
  )
}
