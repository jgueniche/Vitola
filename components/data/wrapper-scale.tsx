import { cn } from '@/lib/utils'

/**
 * The six official wrapper shades, as a data-visualisation component (§4.1).
 *
 * The palette is the trade scale, so the scale renders in the palette. Colour is
 * never the only carrier of meaning: the label is always present, and each dot
 * carries a hairline ring so the darkest shades stay perceptible on the dark
 * ground.
 */

export const WRAPPER_SHADES = [
  'claro',
  'colorado_claro',
  'colorado',
  'colorado_maduro',
  'maduro',
  'oscuro',
] as const

export type WrapperShade = (typeof WRAPPER_SHADES)[number]

const SHADE_LABELS: Record<WrapperShade, string> = {
  claro: 'Claro',
  colorado_claro: 'Colorado claro',
  colorado: 'Colorado',
  colorado_maduro: 'Colorado maduro',
  maduro: 'Maduro',
  oscuro: 'Oscuro',
}

const SHADE_SWATCH: Record<WrapperShade, string> = {
  claro: 'bg-shade-claro',
  colorado_claro: 'bg-shade-colorado-claro',
  colorado: 'bg-shade-colorado',
  colorado_maduro: 'bg-shade-colorado-maduro',
  maduro: 'bg-shade-maduro',
  oscuro: 'bg-shade-oscuro',
}

export function wrapperShadeLabel(shade: WrapperShade): string {
  return SHADE_LABELS[shade]
}

export function WrapperScale({
  shade,
  showLabel = true,
  className,
}: {
  shade: WrapperShade
  showLabel?: boolean
  className?: string
}) {
  const activeIndex = WRAPPER_SHADES.indexOf(shade)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={`Cape : ${SHADE_LABELS[shade]}, position ${activeIndex + 1} sur ${WRAPPER_SHADES.length}`}
        className="flex items-center gap-1"
      >
        {WRAPPER_SHADES.map((step, index) => (
          <span
            key={step}
            aria-hidden="true"
            className={cn(
              'ring-rule-strong size-2.5 rounded-full ring-1',
              index <= activeIndex ? SHADE_SWATCH[step] : 'bg-transparent',
            )}
          />
        ))}
      </span>
      {showLabel ? (
        <span className="text-ink-muted text-sm">{SHADE_LABELS[shade]}</span>
      ) : null}
    </div>
  )
}
