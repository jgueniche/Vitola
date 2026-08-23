// useActionState — deciding can be refused for two reasons a reviewer must
// read: the sheet moved under the proposal, or they are not an editor. Both
// have to appear on the proposal they tried to decide.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { fieldLabel } from '@/components/wiki/diff-view'

import { approveRevision, rejectRevision, withdrawRevision, type WikiState } from './actions'

const copy = m.contributions

/**
 * Accept or refuse, from one form.
 *
 * One `<textarea>` shared by both buttons, and that is the point: a refusal
 * requires a word — `rejectRevision` enforces it, the constraint does not —
 * because the contributor is the only person who cannot see why their proposal
 * was declined. An approval may carry one too, and often should.
 *
 * `formAction` on each button rather than two forms, so the reviewer types once
 * and then decides. Two forms would mean two textareas and a coin flip about
 * which one holds the text.
 */
export function DecideForm({ id }: { id: string }) {
  const [approveState, approve, approving] = useActionState<WikiState, FormData>(
    approveRevision,
    {},
  )
  const [rejectState, reject, rejecting] = useActionState<WikiState, FormData>(rejectRevision, {})

  /* Only refusals surface here. A decision that succeeds redirects, so its
     form is gone before it could have rendered a confirmation — see the action. */
  const state = approveState.error ? approveState : rejectState

  return (
    <form className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`decide-${id}`}>{copy.decideComment}</Label>
        <Textarea id={`decide-${id}`} name="comment" maxLength={1000} />
        <p className="text-ink-muted text-xs leading-relaxed">{copy.decideCommentHint}</p>
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.stale && state.stale.length > 0 ? (
        <p className="text-ink-muted measure text-xs leading-relaxed">
          {copy.staleBody.replace('{fields}', state.stale.map(fieldLabel).join(', '))}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" formAction={approve} disabled={approving || rejecting}>
          {copy.approve}
        </Button>
        <Button
          type="submit"
          variant="secondary"
          formAction={reject}
          disabled={approving || rejecting}
        >
          {copy.reject}
        </Button>
      </div>
    </form>
  )
}

/** The author takes back a proposal nobody has decided on yet. */
export function WithdrawForm({ id }: { id: string }) {
  return (
    <form
      action={withdrawRevision}
      onSubmit={(event) => {
        if (!window.confirm(copy.withdrawConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        {copy.withdraw}
      </Button>
    </form>
  )
}
