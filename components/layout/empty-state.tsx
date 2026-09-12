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
    <div className={cn('border-rule flex flex-col gap-1.5 border-t border-b py-4', className)}>
      <p className="text-ink text-sm font-medium">{title}</p>
      <p className="lede">{description}</p>
      {action ? <div className="pt-1.5">{action}</div> : null}
    </div>
  )
}
