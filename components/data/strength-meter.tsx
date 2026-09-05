import { cn } from '@/lib/utils'

/**
 * Perceived strength, in five notches (§5.1 ref.strength).
 *
 * Hairlines rather than a progress bar: a progress bar implies completion, and
 * a strength is not progress. Values keep the vocabulary of the brief.
 */

export const STRENGTHS = ['leger', 'leger_moyen', 'moyen', 'moyen_corse', 'corse'] as const

export type Strength = (typeof STRENGTHS)[number]

const STRENGTH_LABELS: Record<Strength, string> = {
  leger: 'Léger',
  leger_moyen: 'Léger à moyen',
  moyen: 'Moyen',
  moyen_corse: 'Moyen-corsé',
  corse: 'Corsé',
}

export function strengthLabel(strength: Strength): string {
  return STRENGTH_LABELS[strength]
}

export function StrengthMeter({
  strength,
  showLabel = true,
  size = 'sm',
  className,
}: {
  strength: Strength
  showLabel?: boolean
  /** `lg` is the spec strip of a sheet: 10px notches, 8 to 20px tall. */
  size?: 'sm' | 'lg'
  className?: string
}) {
  const activeIndex = STRENGTHS.indexOf(strength)
  const base = size === 'lg' ? 8 : 6
  const step = size === 'lg' ? 3 : 2

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`Force : ${STRENGTH_LABELS[strength]}, ${activeIndex + 1} sur ${STRENGTHS.length}`}
        className={cn('flex items-end', size === 'lg' ? 'gap-1' : 'gap-0.5')}
      >
        {STRENGTHS.map((notch, index) => (
          <span
            key={notch}
            aria-hidden="true"
            className={cn(
              'rounded-[1px]',
              size === 'lg' ? 'w-2.5' : 'w-1.5',
              index <= activeIndex ? 'bg-accent' : 'bg-rule-strong',
            )}
            style={{ height: `${base + index * step}px` }}
          />
        ))}
      </span>
      {showLabel ? (
        <span className="text-ink-muted text-sm">{STRENGTH_LABELS[strength]}</span>
      ) : null}
    </div>
  )
}
