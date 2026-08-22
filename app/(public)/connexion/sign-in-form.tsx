'use client'

// useActionState: the form needs the action's result back to show either the
// error or the "check your inbox" state. Same reason as the age gate form.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { signIn, type SignInState } from './actions'

function Submit({ intent, children }: { intent: 'password' | 'link'; children: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      name="intent"
      value={intent}
      size={intent === 'password' ? 'lg' : 'sm'}
      variant={intent === 'password' ? undefined : 'ghost'}
      disabled={pending}
    >
      {children}
    </Button>
  )
}

export function SignInForm({ suite, linkError }: { suite: string; linkError: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {})
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
    <form action={formAction} className="flex max-w-80 flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{m.auth.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{m.auth.passwordLabel}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" />
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>

      <Submit intent="password">{m.auth.submitPassword}</Submit>

      <div className="border-rule flex items-center gap-3 border-t pt-4">
        <span className="text-ink-muted text-xs">{m.auth.orLink}</span>
        <Submit intent="link">{m.auth.submitLink}</Submit>
      </div>
    </form>
  )
}
