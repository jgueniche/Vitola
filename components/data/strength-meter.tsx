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
  className,
}: {
  strength: Strength
  showLabel?: boolean
  className?: string
}) {
  const activeIndex = STRENGTHS.indexOf(strength)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`Force : ${STRENGTH_LABELS[strength]}, ${activeIndex + 1} sur ${STRENGTHS.length}`}
        className="flex items-end gap-0.5"
      >
        {STRENGTHS.map((step, index) => (
          <span
            key={step}
            aria-hidden="true"
            className={cn(
              'w-1.5 rounded-[1px]',
              index <= activeIndex ? 'bg-accent' : 'bg-rule-strong',
            )}
            style={{ height: `${6 + index * 2}px` }}
          />
        ))}
      </span>
      {showLabel ? (
        <span className="text-ink-muted text-sm">{STRENGTH_LABELS[strength]}</span>
      ) : null}
    </div>
  )
}
