'use client'

// useActionState: the form needs the action's result back to show the error
// next to the field it concerns. Same reason as the age gate form.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { signIn, type SignInState } from './actions'

function Submit({ intent, children }: { intent: 'password' | 'signup'; children: string }) {
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

/**
 * One form, two buttons. Signing in and creating the account ask for the
 * same two things, so they share the fields and differ by intent — the
 * button pressed travels with the form, and a blank password asks for one
 * rather than guessing what was meant.
 */
export function SignInForm({ suite, linkError }: { suite: string; linkError: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {})
  const errorId = 'sign-in-error'
  const error = state.error ?? (linkError ? m.auth.errors.link : undefined)

  return (
    <form action={formAction} className="flex max-w-80 flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{m.auth.emailLabel}</Label>
        {/* Keyed on the address the action sent back: a refused submission
            resets the form (React 19), and a remount with the new default
            is the one way the field keeps what was typed. */}
        <Input
          key={state.email ?? ''}
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email ?? ''}
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

      <div className="border-rule flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center gap-3">
          <span className="text-ink-muted text-xs">{m.auth.orSignUp}</span>
          <Submit intent="signup">{m.auth.submitSignUp}</Submit>
        </div>
        <p className="text-ink-faint text-xs leading-relaxed">{m.auth.signUpHint}</p>
      </div>
    </form>
  )
}
