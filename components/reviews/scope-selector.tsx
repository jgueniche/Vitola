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
 * One option carries more than a label, and `SCOPE_TRAITS` is what forces this
 * component to render it: **followers**' audience grows after the choice is
 * made. Twelve today, three hundred in six months, and nothing asks again. That
 * is the ADR 0004 arbitration of 22 August, and the caution note below is where
 * it is discharged.
 *
 * A second sentence joined it in P3, and it is the honest half of ADR 0007's D1.
 * Until migration 0010 this component said the scope reached nobody, because no
 * `follows` table existed. It now reaches people — and the thing worth saying
 * changed rather than disappeared: an abonnement is **free**, so the author does
 * not choose who joins that audience. What they do keep is the removal, from
 * their own profile. Dropping the warning without replacing it would have turned
 * a scope that did nothing into a scope that quietly did more than expected.
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
  const [seen, setSeen] = useState(value)

  /*
   * Re-reads the prop when the server sends a new one, and this is not
   * defensive tidying — without it the control lies about who can read an entry.
   *
   * Measured, in a browser, against the real database. Set a public entry to
   * "moi seul" and save: the entry is stored private, the editor re-renders
   * from the revalidated page, and this component comes back initialised from
   * the *stale* prop — showing "Tout le monde" over an entry that is now
   * private. Save once more, for a typo, and the form posts `public` and
   * republishes it. Nobody asked for that, and nothing on screen said it
   * happened.
   *
   * `useState` only reads its initial value on mount, so copying a prop into
   * state and never reconciling is half the bug. Adjusted during render rather
   * than in an effect — React documents this pattern for exactly this case, and
   * `react-hooks/set-state-in-effect` rules the alternative out anyway.
   */
  if (value !== undefined && value !== seen) {
    setSeen(value)
    setSelected(value)
  }

  function choose(next: ReviewVisibility) {
    setSelected(next)
    onChange?.(next)
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="eyebrow mb-2">{copy.legend}</legend>

      {/*
        Keyed on the server's value, which is the other half of the bug above and
        the half that took a browser to find. React 19 resets a form after its
        Server Action returns, and a reset restores every input to the
        `defaultChecked` it was given **at mount** — React syncs that once and
        never again. So after saving "moi seul", state said private, the badge
        two blocks up said private, and the radio silently snapped back to the
        public it had been mounted with. Instrumented before it was believed:
        `{"prop":"private","selected":"private"}` over a DOM reading `public`.

        Re-keying remounts the group whenever the stored scope changes, which is
        what re-establishes `defaultChecked`. It is not cosmetic: the reverted
        radio is what the *next* submit posts, so a second save — fixing a typo —
        republished an entry its author had just made private.
      */}
      <div key={value ?? 'new'} className="flex flex-col gap-2">
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
        <div
          role="note"
          className="border-caution measure flex flex-col gap-2 border-l-2 pl-3 text-xs leading-relaxed"
        >
          <p className="text-ink-muted">{copy.followersWarning}</p>
          <p className="text-ink-faint">{copy.followersOpen}</p>
        </div>
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
