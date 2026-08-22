'use client'

// useActionState: the form must show back what its action refused — "une entrée
// demande au moins une note ou un commentaire", "la note va de 0 à 100" — and
// clear itself only when something was actually written. Same reason as the
// comment form beside it.
import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { saveLogEntry, type EntryState } from '@/app/(app)/carnet/actions'
import { ScopeSelector } from '@/components/reviews/scope-selector'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { REVIEW_LIMITS } from '@/lib/reviews/model'
import { routes } from '@/lib/routes'

const copy = m.notebook.form

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {copy.submit}
    </Button>
  )
}

/**
 * The daily gesture, on the page where it happens (ADR 0004).
 *
 * A note, a word, or both — `reviews_log_says_something` asks for one of the
 * two and no more, which is the whole difference between a notebook and a
 * review site. The structured exercise is one link away and stays there: a
 * six-criterion form on a cigar page would turn "j'ai fumé celui-ci" into
 * homework, and the entry nobody writes is the entry that was too much work.
 *
 * `today` arrives as a prop rather than being computed here. `new Date()` in a
 * client component renders one date on the server and possibly another in the
 * browser, and React calls that a hydration error — on a field the member is
 * about to submit.
 */
export function LogForm({
  cigarId,
  slug,
  today,
}: {
  cigarId: string
  slug: string
  today: string
}) {
  const [state, formAction] = useActionState<EntryState, FormData>(saveLogEntry, {})
  const form = useRef<HTMLFormElement>(null)
  const errorId = 'log-form-error'

  // Emptied on success, and only on success. A refused submission that wipes
  // what was typed makes someone write it twice to read the same refusal.
  useEffect(() => {
    if (state.done) form.current?.reset()
  }, [state.done])

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl">{copy.logTitle}</h3>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.logLede}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="log-smoked-on">{copy.smokedOn}</Label>
          <Input id="log-smoked-on" name="smokedOn" type="date" defaultValue={today} required />
          <p className="text-ink-faint text-xs">{copy.smokedOnHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="log-score">{copy.score}</Label>
          <Input
            id="log-score"
            name="scoreTotal"
            type="number"
            inputMode="decimal"
            min={REVIEW_LIMITS.scoreMin}
            max={REVIEW_LIMITS.scoreMax}
            step={0.1}
            placeholder={copy.scorePlaceholder}
          />
          <p className="text-ink-faint text-xs">{copy.scoreHint}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="log-body">{copy.body}</Label>
        <Textarea
          id="log-body"
          name="body"
          maxLength={REVIEW_LIMITS.bodyMax}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : 'log-body-hint'}
        />
        <p id="log-body-hint" className="text-ink-faint text-xs">
          {copy.bodyHint}
        </p>
      </div>

      <ScopeSelector pendingShares />

      {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}

      {state.done ? (
        <p role="status" className="text-positive flex flex-wrap items-center gap-3 text-sm">
          {copy.saved}
          <Link
            href={state.id ? routes.notebookEntry(state.id) : routes.notebook()}
            className="text-accent-bright underline underline-offset-4"
          >
            {copy.savedSeeIt}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Submit />
        <Link
          href={routes.cigarTasting(slug)}
          className="text-ink-muted hover:text-ink text-sm underline underline-offset-4"
        >
          {copy.tastingLink}
        </Link>
      </div>
    </form>
  )
}
