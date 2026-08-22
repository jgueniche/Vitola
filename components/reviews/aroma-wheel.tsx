'use client'

// useState: a wheel is a control, and a control holds what has been picked.
// The selection also has to travel with the form, which it does through the
// hidden inputs at the bottom — so this is a fancy <select multiple>, not a
// second source of truth.
import { useMemo, useState } from 'react'

import { m } from '@/lib/i18n'
import type { AromaFamily } from '@/lib/aromas/queries'
import { ring } from '@/lib/aromas/wheel'
import { REVIEW_LIMITS } from '@/lib/reviews/model'
import { cn } from '@/lib/utils'

const copy = m.notebook.tasting

/** Geometry, in the units of the viewBox below. Centre is the origin. */
const FAMILY_INNER = 148
const FAMILY_OUTER = 192
const DESCRIPTOR_INNER = 84
const DESCRIPTOR_OUTER = 142

/**
 * The aroma wheel as an input (§5.4).
 *
 * The reference page at `/aromes` lists the eighty-seven rows because a list is
 * what one reads; here one points, and the circular form of the brief belongs
 * to this side of that distinction.
 *
 * **Why it drills in rather than showing all eighty-seven at once.** The classic
 * printed wheel prints every descriptor around one rim. On a screen that is
 * seventy-six segments of four degrees each: unlabellable, and a touch target
 * smaller than a fingertip. So the outer ring keeps the eleven families in place
 * as context, and the inner ring gives the focused family's descriptors the
 * whole turn. Nothing is hidden — the families never move, and the ring under
 * them changes.
 *
 * **The selection is not confined to the focused family.** Picking three woods
 * and then two spices keeps all five: the chips below are the running total,
 * and they are what a member reads back before saving.
 *
 * Accessibility: the segments are `role="checkbox"` with `aria-checked` and
 * keyboard handlers, and every selected descriptor is also a real chip button
 * below the wheel. Someone who never sees the circle can still work entirely
 * from the chips and the family buttons.
 */
export function AromaWheel({
  families,
  name = 'aromaTags',
  initial = [],
  onSelectionChange,
}: {
  families: AromaFamily[]
  name?: string
  initial?: number[]
  /* React does not fire an input event when it rewrites a hidden field, so a
     form watching itself never learns that the wheel moved. The tasting form's
     autosave hangs off this callback for exactly that reason. */
  onSelectionChange?: (ids: number[]) => void
}) {
  const [selected, setSelected] = useState<number[]>(initial)
  const [focused, setFocused] = useState(0)

  const family = families[focused]
  const familySectors = useMemo(
    () => ring(families.length, FAMILY_INNER, FAMILY_OUTER, 1.2),
    [families.length],
  )
  const descriptorSectors = useMemo(
    () => ring(family?.descriptors.length ?? 0, DESCRIPTOR_INNER, DESCRIPTOR_OUTER, 1.6),
    [family?.descriptors.length],
  )

  /** Labels for the chips, across every family — the selection is global. */
  const labels = useMemo(() => {
    const map = new Map<number, string>()
    for (const entry of families) {
      for (const descriptor of entry.descriptors) map.set(descriptor.id, descriptor.label)
    }
    return map
  }, [families])

  const full = selected.length >= REVIEW_LIMITS.aromaTagsMax

  function apply(next: number[]) {
    setSelected(next)
    onSelectionChange?.(next)
  }

  function toggle(id: number) {
    if (selected.includes(id)) {
      apply(selected.filter((value) => value !== id))
      return
    }
    if (selected.length >= REVIEW_LIMITS.aromaTagsMax) return
    apply([...selected, id])
  }

  function onSegmentKey(event: React.KeyboardEvent, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  if (families.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:gap-8">
        <svg
          viewBox="-200 -200 400 400"
          role="group"
          aria-label={copy.stepAromas}
          className="w-full max-w-sm shrink-0 select-none"
        >
          {/* --- the eleven families, always in place --------------------- */}
          {families.map((entry, index) => {
            const sector = familySectors[index]
            if (!sector) return null
            const active = index === focused
            const picked = entry.descriptors.filter((d) => selected.includes(d.id)).length

            return (
              <g
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={entry.label}
                onClick={() => setFocused(index)}
                onKeyDown={(event) => onSegmentKey(event, () => setFocused(index))}
                className="cursor-pointer focus:outline-none"
              >
                <path
                  d={sector.path}
                  className={cn(
                    'transition-colors duration-(--duration-quick)',
                    active ? 'fill-accent' : picked > 0 ? 'fill-accent/25' : 'fill-surface-raised',
                  )}
                  stroke="currentColor"
                  strokeWidth={0.75}
                  /* currentColor resolves to the rule token set on the wrapper,
                     so the hairlines follow the theme without naming a colour. */
                  color="var(--color-rule-strong)"
                />
                <text
                  x={sector.labelAt.x}
                  y={sector.labelAt.y}
                  transform={`rotate(${sector.labelRotation} ${sector.labelAt.x} ${sector.labelAt.y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    'pointer-events-none text-[10px]',
                    active ? 'fill-on-accent' : 'fill-ink-muted',
                  )}
                >
                  {entry.label}
                </text>
              </g>
            )
          })}

          {/* --- the focused family's descriptors, given the whole turn ---- */}
          {(family?.descriptors ?? []).map((descriptor, index) => {
            const sector = descriptorSectors[index]
            if (!sector) return null
            const picked = selected.includes(descriptor.id)

            return (
              <g
                key={descriptor.id}
                role="checkbox"
                tabIndex={0}
                aria-checked={picked}
                aria-label={descriptor.label}
                aria-disabled={!picked && full ? true : undefined}
                onClick={() => toggle(descriptor.id)}
                onKeyDown={(event) => onSegmentKey(event, () => toggle(descriptor.id))}
                className="cursor-pointer focus:outline-none"
              >
                <path
                  d={sector.path}
                  className={cn(
                    'transition-colors duration-(--duration-quick)',
                    picked ? 'fill-accent' : full ? 'fill-surface' : 'fill-surface hover:fill-surface-raised',
                  )}
                  stroke="currentColor"
                  strokeWidth={0.75}
                  color="var(--color-rule)"
                />
                <text
                  x={sector.labelAt.x}
                  y={sector.labelAt.y}
                  transform={`rotate(${sector.labelRotation} ${sector.labelAt.x} ${sector.labelAt.y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    'pointer-events-none text-[9px]',
                    picked ? 'fill-on-accent' : 'fill-ink-muted',
                  )}
                >
                  {descriptor.label}
                </text>
              </g>
            )
          })}

          {/* --- the hub says where one is and how much is chosen ---------- */}
          <text
            x={0}
            y={-8}
            textAnchor="middle"
            className="fill-ink font-display text-[15px]"
          >
            {family?.label ?? ''}
          </text>
          <text x={0} y={12} textAnchor="middle" className="fill-ink-faint text-[10px]">
            {copy.aromaSelected.replace('{count}', String(selected.length))}
          </text>
        </svg>

        {/* --- the running total, and the only control a chip needs ------- */}
        <div className="flex w-full flex-col gap-3">
          <p className="text-ink-muted text-sm leading-relaxed">{copy.stepAromasHint}</p>

          {selected.length === 0 ? (
            <p className="text-ink-faint text-sm">{copy.aromaEmpty}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {selected.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="border-rule-strong text-ink hover:border-negative hover:text-negative inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-xs transition-colors duration-(--duration-quick)"
                  >
                    {labels.get(id) ?? id}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">{m.notebook.shares.remove}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => apply([])}
              className="text-ink-faint hover:text-ink w-fit text-xs underline underline-offset-4"
            >
              {copy.aromaClear}
            </button>
          ) : null}
        </div>
      </div>

      {/* What actually travels with the form. The wheel is the affordance. */}
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  )
}
