import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * <Band /> — the signature element (§4.4 of the brief).
 *
 * A cigar band is the only object every smoker removes, turns over and keeps
 * before tasting anything. Making it the one memorable component lets the
 * product supply its own visual grammar instead of borrowing one from software.
 *
 * Four variants, one shape:
 *   header      — tops a cigar card; the card IS a band
 *   divider     — separates editorial sections
 *   badge       — compact, inline, for profiles and contribution levels
 *   viewfinder  — the scan aiming frame; the frame IS a band (P4)
 *
 * Everything else in the interface stays silent: hairlines, 3px radius, no
 * shadow, a single accent. A second memorable element would not make two — it
 * would leave none.
 */

const bandStyles = cva('relative w-full', {
  variants: {
    variant: {
      header: 'py-0',
      divider: 'py-0',
      // `self-start` is load-bearing: as a flex child, align-items:stretch
      // would otherwise make it full width and it would stop reading as a badge.
      badge: 'inline-block w-auto self-start',
      viewfinder: 'py-0',
    },
  },
  defaultVariants: { variant: 'header' },
})

const lockupStyles = cva('flex items-center justify-center text-center', {
  variants: {
    variant: {
      header: 'gap-3 px-4 py-3',
      divider: 'gap-3 px-4 py-2',
      badge: 'gap-2 px-3 py-1.5',
      viewfinder: 'gap-3 px-4 py-2',
    },
  },
  defaultVariants: { variant: 'header' },
})

/** The brass hairline. Its gradient is defined once, in globals.css. */
function BrassRule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('brass-rule h-px w-full', className)} />
}

export type BandProps = VariantProps<typeof bandStyles> & {
  /** Brand name, set in Marcellus small caps. */
  brand?: string
  /** Vitola or commercial name, to the right of the separator. */
  vitola?: string
  /** Free content, used instead of the brand/vitola lockup. */
  children?: ReactNode
  className?: string
}

export function Band({ variant = 'header', brand, vitola, children, className }: BandProps) {
  const hasLockup = Boolean(brand ?? vitola ?? children)

  // A band with no content is pure decoration: announce it as a separator and
  // keep it out of the accessibility tree's reading order.
  if (!hasLockup) {
    return (
      <div role="separator" className={cn(bandStyles({ variant }), className)}>
        <BrassRule />
      </div>
    )
  }

  if (variant === 'viewfinder') {
    return (
      <div className={cn(bandStyles({ variant }), className)}>
        <BrassRule />
        <div className={lockupStyles({ variant })}>{children}</div>
        <BrassRule />
      </div>
    )
  }

  return (
    <div className={cn(bandStyles({ variant }), className)}>
      <BrassRule />
      <div className={lockupStyles({ variant })}>
        {children ?? (
          <>
            {brand ? <span className="eyebrow text-ink">{brand}</span> : null}
            {brand && vitola ? (
              <span aria-hidden="true" className="text-accent text-xs">
                ·
              </span>
            ) : null}
            {vitola ? <span className="eyebrow text-ink-muted">{vitola}</span> : null}
          </>
        )}
      </div>
      <BrassRule />
    </div>
  )
}
