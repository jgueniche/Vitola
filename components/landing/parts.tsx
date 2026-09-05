import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The small vocabulary the landing page is built from.
 *
 * Nothing here is a new design idea: the panel is the cigar card's border and
 * radius, the row is its hairline, the pill is the referential's status chip.
 * The landing page reuses the interface it is describing — a marketing page
 * that invents its own components ends up advertising a product that does not
 * exist.
 */

/** A module's eyebrow, title and standfirst. */
export function ModuleHead({
  number,
  name,
  title,
  body,
  className,
}: {
  number: string
  name: string
  title: string
  body?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <p className="eyebrow">
        <span className="font-mono">{number}</span>
        {'  ·  '}
        {name}
      </p>
      <h2 className="font-display text-display-sm mt-4 leading-[1.12] text-balance sm:text-[2.75rem]">
        {title}
      </h2>
      {body ? <p className="text-ink-muted mt-5 text-[1.0625rem] leading-relaxed">{body}</p> : null}
    </div>
  )
}

/** The hairline-separated argument list under a module's standfirst. */
export function Points({
  points,
  icons,
  className,
}: {
  points: readonly { title: string; body: string }[]
  icons: readonly LucideIcon[]
  className?: string
}) {
  return (
    <ul className={cn('mt-8 flex flex-col', className)}>
      {points.map((point, index) => {
        const Icon = icons[index]
        return (
          <li
            key={point.title}
            className="border-rule grid grid-cols-[20px_1fr] items-start gap-x-3.5 border-t py-4 last:border-b"
          >
            {Icon ? (
              <Icon aria-hidden="true" className="text-accent mt-0.5 size-5" strokeWidth={1.5} />
            ) : (
              <span aria-hidden="true" className="size-5" />
            )}
            <p className="text-ink-muted text-[0.9375rem] leading-normal">
              <b className="text-ink font-medium">{point.title}</b> {point.body}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

/** A mock of an interface surface: the cigar card's frame, without its content. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-rule bg-surface rounded-band overflow-hidden border', className)}>
      {children}
    </div>
  )
}

export function PanelHead({ children }: { children: ReactNode }) {
  return (
    <div className="border-rule flex items-center justify-between gap-4 border-b px-4 py-3.5">
      {children}
    </div>
  )
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-rule flex items-center justify-between gap-4 border-t px-4 py-3.5 text-sm first:border-t-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* The word carries the meaning, the ring carries the tone: 11px of
   `text-positive` on a raised surface fails AA contrast in the default dark
   theme, and a pill whose meaning lived in its colour would fail 1.4.1 anyway. */
const PILL_TONE = {
  neutral: 'text-ink-muted',
  positive: 'text-ink ring-positive/40 ring-1 ring-inset',
  caution: 'text-ink ring-caution/40 ring-1 ring-inset',
} as const

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: keyof typeof PILL_TONE
}) {
  return (
    <span
      className={cn(
        'bg-surface-raised inline-flex h-[22px] shrink-0 items-center rounded-[2px] px-2 text-[11px]',
        PILL_TONE[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-[2px] border px-2.5 text-xs',
        active ? 'border-accent text-accent-bright' : 'border-rule-strong text-ink-muted',
      )}
    >
      {children}
    </span>
  )
}

/**
 * The dash that opens a line in the Cercle table. Two pixels rather than the
 * house hairline: at 1px, sitting on a fractional row height, it lands on a
 * half pixel and disappears on every other render.
 */
export function Marker({ accent = false }: { accent?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('mt-2.5 h-0.5 w-2.5 rounded-[1px]', accent ? 'bg-accent' : 'bg-ink-faint')}
    />
  )
}

/** The five notches of <StrengthMeter />, reused as decoration. */
export function Notches({ filled }: { filled: number }) {
  return (
    <span aria-hidden="true" className="flex items-end gap-px">
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className={cn('w-1.5 rounded-[1px]', index < filled ? 'bg-accent' : 'bg-rule-strong')}
          style={{ height: `${6 + index * 2}px` }}
        />
      ))}
    </span>
  )
}

/** The six wrapper shades of <WrapperScale />, reused as decoration. */
const SHADES = [
  'bg-shade-claro',
  'bg-shade-colorado-claro',
  'bg-shade-colorado',
  'bg-shade-colorado-maduro',
  'bg-shade-maduro',
  'bg-shade-oscuro',
] as const

export function Shades({ upTo }: { upTo: number }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {SHADES.map((shade, index) => (
        <span
          key={shade}
          className={cn(
            'ring-rule-strong size-2.5 rounded-full ring-1',
            index < upTo ? shade : 'bg-transparent',
          )}
        />
      ))}
    </span>
  )
}
