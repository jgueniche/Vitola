'use client'

// useActionState: the form needs the action's result back to show either the
// error or the "check your inbox" state. Same reason as the age gate form.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { sendMagicLink, type SignInState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {m.auth.submit}
    </Button>
  )
}

export function SignInForm({ suite, linkError }: { suite: string; linkError: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(sendMagicLink, {})
  const errorId = 'sign-in-error'
  const error = state.error ?? (linkError ? m.auth.errors.link : undefined)

  if (state.sentTo) {
    return (
      <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-6">
        <p className="eyebrow">{m.auth.sent}</p>
        <p className="text-ink-muted measure text-sm leading-relaxed">
          {m.auth.sentBody.replace('{email}', state.sentTo)}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{m.auth.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="max-w-80"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>

      <SubmitButton />
    </form>
  )
}
