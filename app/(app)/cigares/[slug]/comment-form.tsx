'use client'

// useActionState: the form must show back the message its action returned —
// "your account cannot comment yet", "2 000 characters at most" — and clear the
// box on success. Same reason as the age gate and the sign-in form.
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { postComment, type CommentState } from './actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {m.comments.submit}
    </Button>
  )
}

export function CommentForm({ cigarId, slug }: { cigarId: string; slug: string }) {
  const [state, formAction] = useActionState<CommentState, FormData>(postComment, {})
  const form = useRef<HTMLFormElement>(null)
  const errorId = 'comment-form-error'

  // Emptied on success, and only on success. A failed submission that wipes
  // what was typed makes the person write it twice to read the same refusal.
  useEffect(() => {
    if (state.done) form.current?.reset()
  }, [state.done])

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="comment-body">{m.comments.formLabel}</Label>
        <Textarea
          id="comment-body"
          name="body"
          required
          maxLength={2000}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : 'comment-form-hint'}
        />
        <p id="comment-form-hint" className="text-ink-faint text-xs">
          {m.comments.formHint}
        </p>
        {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}
      </div>

      <div>
        <Submit />
      </div>
    </form>
  )
}
