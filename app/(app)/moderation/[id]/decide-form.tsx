'use client'

// useActionState — a refusal (missing note, unarmed verb, already decided) is
// re-read in place; success navigates because the decided case leaves the open
// queue. window.confirm before submitting: mod_decide() never re-decides a
// case, so this is the one gesture on the desk that cannot be taken back.
import { useActionState } from 'react'

import { decideReport, type DecideFormState } from '@/app/(app)/moderation/actions'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { MOD_LIMITS } from '@/lib/moderation/model'

const copy = m.moderation.desk.case

type Props = {
  reportId: string
  /** Whether the surface carries hidden_* columns — decides if acts are offered. */
  hideable: boolean
  /** Whether the target is currently hidden — decides which act makes sense. */
  targetHidden: boolean
}

export function DecideForm({ reportId, hideable, targetHidden }: Props) {
  const [state, formAction, pending] = useActionState<DecideFormState, FormData>(
    decideReport,
    {},
  )

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(copy.confirm)) event.preventDefault()
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="report" value={reportId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink text-sm font-medium">{copy.decisionLabel}</legend>
        <label className="text-ink flex items-baseline gap-2 text-sm">
          <input type="radio" name="decision" value="upheld" required />
          {copy.uphold}
        </label>
        <label className="text-ink flex items-baseline gap-2 text-sm">
          <input type="radio" name="decision" value="dismissed" required />
          {copy.dismiss}
        </label>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="mod-note" className="text-ink text-sm font-medium">
          {copy.noteLabel}
        </label>
        <p className="text-ink-muted text-xs">{copy.noteHint}</p>
        <textarea
          id="mod-note"
          name="note"
          rows={3}
          maxLength={MOD_LIMITS.note}
          required
          className="border-rule text-ink rounded-[3px] border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink text-sm font-medium">{copy.actLabel}</legend>
        <label className="text-ink flex items-baseline gap-2 text-sm">
          <input type="radio" name="verb" value="none" defaultChecked />
          {copy.actNone}
        </label>
        {hideable ? (
          <>
            <label className="text-ink flex items-baseline gap-2 text-sm">
              <input type="radio" name="verb" value="hide" disabled={targetHidden} />
              {copy.actHide}
            </label>
            <label className="text-ink flex items-baseline gap-2 text-sm">
              <input type="radio" name="verb" value="restore" disabled={!targetHidden} />
              {copy.actRestore}
            </label>
          </>
        ) : (
          <p className="text-ink-muted measure text-xs leading-relaxed">{copy.actUnavailable}</p>
        )}
      </fieldset>

      {hideable ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="mod-act-reason" className="text-ink text-sm font-medium">
            {copy.actReasonLabel}
          </label>
          <p className="text-ink-muted text-xs">{copy.actReasonHint}</p>
          <textarea
            id="mod-act-reason"
            name="actReason"
            rows={2}
            maxLength={MOD_LIMITS.actReason}
            className="border-rule text-ink rounded-[3px] border bg-transparent px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-ink text-sm">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
