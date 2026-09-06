import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A row of figures — "12 cigares · 340 € · 3 caves".
 *
 * One component for the two pages that each carried their own copy (`/cave`
 * and `/statistiques`). A row between two hairlines, cells divided by one:
 * the bordered, gap-px tile strip it replaces turned three numbers into
 * three panels. And Inter at 24px rather than the didone at 32: a display
 * face is for a title, and "12" is not a title.
 */
export function FigureRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-rule grid border-t border-b sm:grid-cols-3', className)}>
      {children}
    </section>
  )
}

export function Figure({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="border-rule flex flex-col gap-0.5 py-3.5 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:pl-5 sm:[&:not(:last-child)]:pr-5">
      <span
        className={cn('text-2xl leading-tight font-medium tabular-nums', muted && 'text-ink-muted')}
      >
        {value}
      </span>
      <span className="label">{label}</span>
    </div>
  )
}
