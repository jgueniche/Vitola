'use client'

// useActionState: the editor stays where it is on success, so it has a refusal
// to show back — "une entrée demande au moins une note ou un commentaire" — and
// nowhere to navigate to. Same reason as the comment form.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { ScopeSelector } from '@/components/reviews/scope-selector'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { REVIEW_LIMITS, type ReviewKind, type ReviewVisibility } from '@/lib/reviews/model'

import { editEntry, type EntryState } from '../actions'

const copy = m.notebook

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {copy.entry.save}
    </Button>
  )
}

/**
 * What an entry can still change after it was written.
 *
 * Deliberately short. `user_id` and `cigar_id` appear in no UPDATE grant, so an
 * entry changes neither author nor cigar — noting the wrong cigar means deleting
 * and retyping, which is visible, rather than a silent slide through the
 * statistics. And a tasting's six criteria are not offered here: re-scoring the
 * exercise is doing the exercise again, not editing a field.
 *
 * The scope selector is the point of the form. It is the one thing about an
 * entry that a member is likely to want to change long after writing it —
 * publishing a private note, or withdrawing a public one — and ADR 0004 makes
 * that a per-entry decision, which is why it lives on the entry rather than in
 * settings.
 */
export function EntryEditor({
  id,
  kind,
  smokedOn,
  scoreTotal,
  body,
  visibility,
  sharedCount,
}: {
  id: string
  kind: ReviewKind
  smokedOn: string
  scoreTotal: number | null
  body: string | null
  visibility: ReviewVisibility
  sharedCount: number
}) {
  const [state, formAction] = useActionState<EntryState, FormData>(editEntry, {})
  const errorId = 'entry-editor-error'

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />

      <h2 className="text-base font-medium">{copy.entry.edit}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-smoked-on">{copy.form.smokedOn}</Label>
          <Input id="edit-smoked-on" name="smokedOn" type="date" defaultValue={smokedOn} required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-score">{copy.form.score}</Label>
          <Input
            id="edit-score"
            name="scoreTotal"
            type="number"
            inputMode="decimal"
            min={REVIEW_LIMITS.scoreMin}
            max={REVIEW_LIMITS.scoreMax}
            step={0.1}
            defaultValue={scoreTotal ?? undefined}
            /* A tasting's total is the mean of its six criteria and is not
               typed anywhere — showing it editable here would let one number
               contradict the six that produced it. */
            readOnly={kind === 'tasting'}
            aria-readonly={kind === 'tasting' || undefined}
          />
          {kind === 'tasting' ? (
            <p className="text-ink-faint text-xs">{m.notebook.tasting.stepScoresHint}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-body">{copy.form.body}</Label>
        <Textarea
          id="edit-body"
          name="body"
          defaultValue={body ?? ''}
          maxLength={REVIEW_LIMITS.bodyMax}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
      </div>

      <ScopeSelector value={visibility} sharedCount={sharedCount} />

      {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}
      {state.done ? (
        <p role="status" className="text-positive text-sm">
          {copy.form.saved}
        </p>
      ) : null}

      <div>
        <Submit />
      </div>
    </form>
  )
}
