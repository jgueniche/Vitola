// useActionState: an answer can find nothing to answer — an invitation the
// owner withdrew a moment ago — and that refusal has to be read where the
// button was. A success navigates to /cave with its sentence in the URL.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import type { ShareAnswer } from '@/lib/humidor/model'

import { answerHumidorShare, type HumidorState } from './actions'

/**
 * One answer to one shared cave: accept, decline, hide, show again, leave.
 *
 * One form per answer rather than one form with five submit buttons, so that
 * each can carry its own confirmation — only leaving asks, because only
 * leaving cannot be undone from this side: the owner alone can offer the cave
 * again.
 */
export function ShareAnswerButton({
  humidorId,
  answer,
  label,
  confirm,
  variant = 'secondary',
}: {
  humidorId: string
  answer: ShareAnswer
  label: string
  confirm?: string
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(answerHumidorShare, {})

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
      className="flex flex-col items-start gap-1"
    >
      <input type="hidden" name="humidorId" value={humidorId} />
      <input type="hidden" name="answer" value={answer} />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
