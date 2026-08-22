'use client'

// useState: the warning attached to "mes abonnés" has to appear at the moment
// the scope is chosen, not after the form comes back. ADR 0004 makes that
// warning an interface obligation, and an obligation that only fires on submit
// is one the author reads too late to act on.
import { useState } from 'react'

import { m } from '@/lib/i18n'
import { REVIEW_SCOPES, SCOPE_TRAITS, type ReviewVisibility } from '@/lib/reviews/model'
import { cn } from '@/lib/utils'

const copy = m.notebook.scope

const LABELS: Record<ReviewVisibility, { label: string; hint: string }> = {
  private: { label: copy.private, hint: copy.privateHint },
  shared: { label: copy.shared, hint: copy.sharedHint },
  followers: { label: copy.followers, hint: copy.followersHint },
  public: { label: copy.public, hint: copy.publicHint },
}

/**
 * The scope of one entry — private, named people, followers, everyone.
 *
 * Four radios rather than a select, because this is the control that decides
 * who reads a note about tobacco consumption, which §2 of the brief says may be
 * art. 9 data. A collapsed listbox shows one option and hides three; here the
 * four consequences are readable at once, without a click, before choosing.
 *
 * `private` is pre-selected because it is the column default, and ADR 0004 ties
 * that default to art. 25: publishing is a gesture one makes, never one one
 * forgets to undo.
 *
 * Two options carry more than a label, and `SCOPE_TRAITS` is what forces this
 * component to render them:
 *
 *   - **followers** has no readers at all until `public.follows` arrives in P3.
 *     The SELECT branch does not exist, so the entry is visible to its author
 *     and nobody else. Saying so is the difference between a scope that waits
 *     and a scope that silently does nothing.
 *   - **followers** again, once it does work: its audience grows after the
 *     choice is made. Twelve today, three hundred in six months, and nothing
 *     asks again. That is the ADR's arbitration of 22 August, and the sentence
 *     below is where it is discharged.
 *
 * `shared` names people from the entry's own page rather than here: the rows go
 * in `review_shares` keyed by `review_id`, which does not exist until the entry
 * is saved. `pendingShares` says that plainly instead of offering a search box
 * that could not write anything yet.
 */
export function ScopeSelector({
  name = 'visibility',
  value,
  pendingShares = false,
  sharedCount = 0,
  onChange,
}: {
  name?: string
  value?: ReviewVisibility
  /** True on a creation form, where no entry id exists to hang shares on. */
  pendingShares?: boolean
  sharedCount?: number
  onChange?: (next: ReviewVisibility) => void
}) {
  const [selected, setSelected] = useState<ReviewVisibility>(value ?? 'private')

  function choose(next: ReviewVisibility) {
    setSelected(next)
    onChange?.(next)
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="eyebrow mb-2">{copy.legend}</legend>

      <div className="flex flex-col gap-2">
        {REVIEW_SCOPES.map((scope) => {
          const { label, hint } = LABELS[scope]
          const active = selected === scope
          return (
            <label
              key={scope}
              className={cn(
                'flex cursor-pointer gap-3 rounded-[3px] border px-3 py-2.5 transition-colors duration-(--duration-quick)',
                active
                  ? 'border-accent bg-surface-raised'
                  : 'border-rule bg-surface hover:border-rule-strong',
              )}
            >
              <input
                type="radio"
                name={name}
                value={scope}
                checked={active}
                onChange={() => choose(scope)}
                className="accent-accent mt-1 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-ink text-sm">{label}</span>
                <span className="text-ink-muted text-xs leading-relaxed">{hint}</span>
              </span>
            </label>
          )
        })}
      </div>

      {SCOPE_TRAITS[selected].livingAudience ? (
        <p
          role="note"
          className="border-caution text-ink-muted measure border-l-2 pl-3 text-xs leading-relaxed"
        >
          {copy.followersWarning}
        </p>
      ) : null}

      {SCOPE_TRAITS[selected].reachesNobodyYet ? (
        <p className="text-ink-faint measure text-xs leading-relaxed">
          {copy.followersUnavailable}
        </p>
      ) : null}

      {SCOPE_TRAITS[selected].namesPeople ? (
        <p className="text-ink-faint measure text-xs leading-relaxed">
          {pendingShares
            ? copy.sharedPending
            : copy.currentShared.replace('{count}', String(sharedCount))}
        </p>
      ) : null}

      {selected === 'public' ? (
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.publicCounts}</p>
      ) : null}

      <p className="text-ink-faint text-xs">{copy.hint}</p>
    </fieldset>
  )
}
