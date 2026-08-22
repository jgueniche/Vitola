import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * An empty state is an invitation, never a dead end (§4.6).
 * "Votre cave est vide. Scannez une bague ou cherchez une vitole pour commencer."
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
      className={cn(
        'border-rule bg-surface flex flex-col items-center gap-3 rounded-[3px] border px-6 py-12 text-center',
        className,
      )}
    >
      <p className="eyebrow">{title}</p>
      <p className="text-ink-muted measure text-sm leading-relaxed">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
