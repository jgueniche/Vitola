'use client'

// useState: a rating control holds what has been picked, and the pick has to
// travel with the form. Same justification as the aroma wheel — this is a
// fancy radio group, not a second source of truth.
import { useState } from 'react'

import { m } from '@/lib/i18n'
import { RING_MAX, scoreFromRings } from '@/lib/reviews/rings'
import { cn } from '@/lib/utils'

const copy = m.notebook.rings

/**
 * Picking a note, in bands.
 *
 * Five real radios, visually hidden, each with its own label — so the group is
 * reachable by Tab, walked with the arrow keys, and announced as "3 bands out
 * of 5, radio button, 3 of 6" without a single ARIA attribute. Rebuilding that
 * with divs and `role="radiogroup"` is the version that always ships broken.
 *
 * The sixth option is "no note", and it is first in the DOM and checked by
 * default. That is not a nicety: `reviews_log_says_something` accepts an entry
 * that is a sentence and no number, and the QA session's complaint about the
 * smoke form — « ya trop de trucs à remplir c'est trop long » — is answered by
 * nothing being required, not by a shorter list of required things.
 *
 * The posted value is the STORED score, out of a hundred: three bands post 60.
 * The conversion lives in `lib/reviews/rings.ts` and happens here rather than
 * in the action, so the action keeps taking the one scale the column has.
 */
export function RingRatingInput({
  name,
  initialScore = null,
  label,
}: {
  name: string
  /** A stored score out of a hundred, for a form reopening on its own value. */
  initialScore?: number | null
  label: string
}) {
  const initialRings =
    initialScore === null ? 0 : Math.max(0, Math.min(RING_MAX, Math.round(initialScore / 20)))
  const [rings, setRings] = useState(initialRings)

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="label">{label}</legend>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: RING_MAX }, (_, index) => {
            const value = index + 1
            const earned = value <= rings
            return (
              <label
                key={value}
                className="focus-within:outline-accent group cursor-pointer p-1 focus-within:outline-2 focus-within:outline-offset-1"
              >
                <input
                  type="radio"
                  name={name}
                  value={String(scoreFromRings(value))}
                  checked={rings === value}
                  onChange={() => setRings(value)}
                  className="sr-only"
                />
                <span className="sr-only">
                  {value === 1
                    ? copy.pickOne
                    : copy.pickMany
                        .replace('{value}', String(value))
                        .replace('{max}', String(RING_MAX))}
                </span>
                <RingGlyph earned={earned} />
              </label>
            )
          })}
        </div>

        <label className="text-ink-muted hover:text-ink inline-flex cursor-pointer items-center gap-2 text-sm transition-colors duration-(--duration-quick)">
          <input
            type="radio"
            name={name}
            value=""
            checked={rings === 0}
            onChange={() => setRings(0)}
            className="accent-accent size-4"
          />
          {copy.none}
        </label>
      </div>
    </fieldset>
  )
}

/**
 * The clickable band. 28 × 22 with 8px of padding around it in the label —
 * a 44px target, which is the floor the design audit of 5 septembre 2026 found
 * the site was under on the gestures that mattered.
 */
function RingGlyph({ earned }: { earned: boolean }) {
  return (
    <svg
      viewBox="0 0 20 16"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'block h-[1.375rem] w-7 transition-colors duration-(--duration-quick)',
        earned ? 'text-accent' : 'text-rule-strong group-hover:text-ink-faint',
      )}
    >
      <rect
        x="1"
        y="1.5"
        width="18"
        height="13"
        rx="2.5"
        fill={earned ? 'currentColor' : 'none'}
        fillOpacity={earned ? 0.9 : 0}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {earned ? (
        <>
          <path d="M1 5.5 H19" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" />
          <path d="M1 10.5 H19" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" />
        </>
      ) : null}
    </svg>
  )
}
