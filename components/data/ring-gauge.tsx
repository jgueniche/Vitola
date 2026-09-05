import { formatDimensions } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Cepo x length. Monospaced because it is compared column by column and copied
 * by hand — the arbitration rule of §4.3.
 *
 * The optional silhouette draws the cigar to relative scale, which is the one
 * piece of information a number cannot convey: how a 38 ring gauge differs from
 * a 56 at a glance.
 */
export function RingGauge({
  ringGauge,
  lengthMm,
  withSilhouette = false,
  className,
}: {
  ringGauge: number
  lengthMm: number
  withSilhouette?: boolean
  className?: string
}) {
  // Reference frame: a 60 ring gauge and a 235 mm length are the practical
  // maxima of the vitolario, so everything fits inside the box.
  const heightRatio = Math.min(ringGauge / 60, 1)
  const widthRatio = Math.min(lengthMm / 235, 1)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="font-mono text-sm tracking-wide">
        {formatDimensions(ringGauge, lengthMm)}
      </span>
      {/* A fixed 120px reference, never the label's own width: drawn inside
          `w-full` of a flex item sized by its text, the silhouette measured
          about 100px and showed nothing (design audit, 5 septembre 2026). */}
      {withSilhouette ? (
        <span aria-hidden="true" className="flex h-3 w-[7.5rem] items-center">
          <span
            className="bg-ink-faint rounded-full"
            style={{
              width: `${widthRatio * 100}%`,
              height: `${Math.max(heightRatio * 12, 3)}px`,
            }}
          />
        </span>
      ) : null}
    </div>
  )
}
