'use client'

// useActionState: one form, three possible writes — the entry, the lot, the
// announcement — and each has a refusal worth reading in place ("une entrée
// demande au moins une note ou un mot", "une publication s'adresse à
// quelqu'un"). The confirmation names what actually happened, with the link to
// the entry it wrote, and the form empties only then.
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'

import { RingRatingInput } from '@/components/data/ring-rating-input'
import { ScopeSelector } from '@/components/reviews/scope-selector'
import { Button, buttonClass } from '@/components/ui/button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/field'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { REVIEW_LIMITS, type ReviewVisibility } from '@/lib/reviews/model'
import { routes } from '@/lib/routes'

import { smokeThisCigar, type GestureState } from './actions'

const copy = m.sheet.gesture

/**
 * Where the scope starts on this one form. See the note on the component: it
 * is the owner's instruction of 12 septembre 2026, it reverses ADR 0004's
 * art. 25 default, and it is a constant rather than a literal so that there is
 * exactly one place to change it back.
 */
const DEFAULT_SCOPE: ReviewVisibility = 'public'

export type GestureLot = {
  id: string
  qty: number
  purchaseDate: string | null
}

export type GestureVenue = { id: string; label: string }

/**
 * « J'en fume un » — the one gesture of the sheet.
 *
 * Opened by `?geste=fumer` and closed by the plain sheet URL, so the open
 * panel survives the re-render every Server Action provokes (app/CLAUDE.md:
 * interface state lives in the URL). What it writes and in which order is the
 * action's comment; what this component decides is only what to show:
 *
 *   - the lot line appears when the member holds one, ticked by default — the
 *     event is the common case, per ADR 0006's exit criterion;
 *   - "le dire au fil" is greyed while the scope is `private` or `shared`,
 *     with the sentence saying why, because a publication has an audience;
 *   - the six-criterion tasting stays one link away: a form that asks for it
 *     here turns "j'ai fumé celui-ci" into homework.
 *
 * **Two changes from the QA session of 12 septembre 2026, one of them with a
 * cost worth naming.**
 *
 * « Ya trop de trucs à remplir c'est trop long. » Four of the seven controls
 * moved into a `<details>`: the date (which is today), the feed announcement,
 * and the venue. What is left above the fold is a note, a word and who reads
 * it. The note is now five bands to click rather than a number to type, which
 * is the same gesture in one click instead of three keystrokes.
 *
 * « Tout le monde de base peut voir. » So the scope starts at `public`, and
 * this REVERSES a recorded default. ADR 0004 ties `private` to art. 25 —
 * publishing is a gesture one makes, never one one forgets to undo — and
 * ADR 0006's D3 says what leaves the humidor enters the notebook private. The
 * owner asked for the opposite in as many words, and it is their call as the
 * controller; what this component owes in exchange is that the reversal is
 * never silent. So the pill row stays visible and unfolded, `public` is
 * plainly lit, and the sentence under it says the entry will be public and
 * that it feeds the public average. See `docs/decisions-log.md` for the
 * amendment, and reopen it with legal review before the site opens
 * commercially — it is listed there, not here.
 *
 * `today` arrives as a prop rather than being computed here. `new Date()` in a
 * client component renders one date on the server and possibly another in the
 * browser, and React calls that a hydration error — on a field the member is
 * about to submit.
 */
export function SmokeForm({
  cigarId,
  slug,
  today,
  lot,
  venues = [],
}: {
  cigarId: string
  slug: string
  today: string
  lot: GestureLot | null
  /** Referential venues, when the Q6 flag offers them (P5). */
  venues?: GestureVenue[]
}) {
  const [state, action, pending] = useActionState<GestureState, FormData>(smokeThisCigar, {})
  const form = useRef<HTMLFormElement>(null)
  const [scope, setScope] = useState<ReviewVisibility>(DEFAULT_SCOPE)
  const errorId = 'geste-error'

  /* Emptied on success, and only on success: a refused submission that wipes
     what was typed makes someone write it twice to read the same refusal. The
     DOM reset is what the log form did before it; the scope state follows
     through the key below, which remounts the selector at `private`. */
  useEffect(() => {
    if (state.done) form.current?.reset()
  }, [state.done])

  const resetKey = state.done ? `done-${state.id ?? 'event'}` : 'new'
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setScope(DEFAULT_SCOPE)
  }

  const canAnnounce = scope === 'followers' || scope === 'public'

  return (
    <form ref={form} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="itemId" value={lot?.id ?? ''} />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-display-sm">{copy.title}</h2>
        <p className="text-ink-muted text-xs leading-relaxed">{copy.lede}</p>
      </div>

      <RingRatingInput name="scoreTotal" label={copy.score} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="geste-body">{copy.word}</Label>
        <Textarea
          id="geste-body"
          name="body"
          maxLength={REVIEW_LIMITS.bodyMax}
          placeholder={copy.wordPlaceholder}
          className="min-h-20"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
      </div>

      <ScopeSelector key={resetKey} initial={DEFAULT_SCOPE} pendingShares onChange={setScope} />

      <div className="flex flex-col gap-3">
        {lot ? (
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="decrement" defaultChecked className="accent-accent mt-1" />
            <span className="flex flex-col gap-0.5">
              <span>{copy.decrement}</span>
              <span className="text-ink-muted text-xs leading-relaxed">
                {lot.purchaseDate
                  ? copy.decrementHint
                      .replace('{date}', formatEffectiveDate(lot.purchaseDate))
                      .replace('{count}', String(lot.qty))
                  : copy.decrementHintNoDate.replace('{count}', String(lot.qty))}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-ink-faint text-xs leading-relaxed">{copy.needsSomething}</p>
        )}
      </div>

      {/*
        Everything that has a right answer without being asked, folded away:
        the date is today, the feed is a second gesture, the venue is rarer
        still. A native <details> rather than a state, so it costs nothing and
        survives the re-render every Server Action provokes — the panel the
        member opened does not close under their fingers (app/CLAUDE.md).
      */}
      <details className="border-rule border-t pt-3">
        <summary className="text-ink-muted hover:text-ink cursor-pointer text-sm transition-colors duration-(--duration-quick)">
          {copy.more}
        </summary>

        <div className="flex flex-col gap-3 pt-3">
          <div className="flex max-w-56 flex-col gap-1.5">
            <Label htmlFor="geste-smoked-on">{m.notebook.form.smokedOn}</Label>
            <Input id="geste-smoked-on" name="smokedOn" type="date" defaultValue={today} required />
          </div>

          {/* Disabled reads as disabled through the control and a muted ink, never
            through an opacity on the block: a faded hint under 60 % opacity fell
            to 2.5:1 and axe counted it serious (audit of 6 septembre 2026). */}
          <label
            className={`flex items-start gap-3 text-sm ${canAnnounce ? 'cursor-pointer' : 'text-ink-muted'}`}
          >
            <input
              type="checkbox"
              name="announce"
              disabled={!canAnnounce}
              className="accent-accent mt-1"
            />
            <span className="flex flex-col gap-0.5">
              <span>{copy.announce}</span>
              <span className="text-ink-muted text-xs leading-relaxed">
                {canAnnounce ? copy.announceHintOn : copy.announceHintOff}
              </span>
            </span>
          </label>

          {/* Where — a referential venue, optional (P5). Only meaningful when the
            gesture is told on the feed, so it sits under that box and is
            disabled with it; a session without a place stays the common case. */}
          {venues.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="geste-venue">{copy.venue}</Label>
              <Select id="geste-venue" name="venueId" defaultValue="" disabled={!canAnnounce}>
                <option value="">{copy.venueNone}</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.label}
                  </option>
                ))}
              </Select>
              <p className="text-ink-muted text-xs leading-relaxed">{copy.venueHint}</p>
            </div>
          ) : null}
        </div>
      </details>

      {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}

      {state.done ? (
        <p
          role="status"
          className="text-positive flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <span>
            {[
              state.decremented ? copy.savedDecremented : null,
              state.id ? copy.savedNoted : null,
              state.announced ? copy.savedAnnounced : null,
            ]
              .filter((part): part is string => part !== null)
              .join(' ') || copy.saved}
          </span>
          {state.id ? (
            <Link
              href={routes.notebookEntry(state.id)}
              className="text-accent-bright underline underline-offset-4"
            >
              {copy.seeEntry}
            </Link>
          ) : null}
          {state.notice ? <span className="text-caution">{state.notice}</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {copy.save}
        </Button>
        <Link href={routes.cigar(slug)} className={buttonClass({ variant: 'ghost' })}>
          {copy.cancel}
        </Link>
      </div>
    </form>
  )
}
