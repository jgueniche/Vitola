'use client'

import Link from 'next/link'
// useActionState: the form needs the action's result back to show the error
// next to the field it concerns. Same reason as the age gate form.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { signIn, type SignInState } from './actions'

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {children}
    </Button>
  )
}

/**
 * Signing in and creating an account are TWO SCREENS, not one form with two
 * buttons.
 *
 * They were one form until 16 septembre 2026, and the reason was real — both
 * ask for the same two things, so the fields were shared and only the button
 * pressed differed. What that missed is what a person reads before pressing
 * anything: the page was titled « Se connecter », its primary button said
 * « Se connecter », and « Créer un compte » was a small ghost button under a
 * rule. Pressing it submitted the same fields with another intent, so the
 * screen came back looking exactly as it did before — sometimes with an error,
 * sometimes, on an empty address, with nothing at all. « Je reste avec le
 * bouton se connecter, ce qui n'a pas de sens » (QA du 16 septembre). A
 * control that looks like a mode switch must not be a submit.
 *
 * So the mode lives in the URL — `?mode=inscription` — and everything the
 * reader uses to know where they are follows it: the title, the lede, the only
 * button, the tab. The way across is a LINK, which is what it always was.
 * In the URL it also survives the back button and can be handed to someone
 * (root CLAUDE.md, « un état d'interface dans un composant client se referme
 * à chaque écriture »).
 *
 * `intent` stays in the form, now fixed by the screen rather than by which
 * button was pressed: the action is unchanged, and the two fields still cannot
 * create an account from the sign-in screen.
 */
export function SignInForm({
  suite,
  linkError,
  signUp,
}: {
  suite: string
  linkError: boolean
  /** True on `?mode=inscription`: the screen creates the account. */
  signUp: boolean
}) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {})
  const errorId = 'sign-in-error'
  const error = state.error ?? (linkError ? m.auth.errors.link : undefined)

  // The way to the other screen keeps `suite`, so whatever sent the person
  // here still receives them afterwards.
  const params = new URLSearchParams()
  if (!signUp) params.set('mode', 'inscription')
  if (suite) params.set('suite', suite)
  const query = params.toString()
  const otherHref = query ? `${routes.signIn()}?${query}` : routes.signIn()

  return (
    <form action={formAction} className="flex max-w-80 flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />
      <input type="hidden" name="intent" value={signUp ? 'signup' : 'password'} />

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
        {/* `new-password` is not cosmetic: it is what makes a password manager
            offer to generate and store one instead of filling the old one. */}
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={signUp ? 'new-password' : 'current-password'}
        />
        {signUp ? <p className="text-ink-faint text-xs">{m.auth.signUpHint}</p> : null}
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>

      <Submit>{signUp ? m.auth.submitSignUp : m.auth.submitPassword}</Submit>

      <div className="border-rule flex items-center gap-2 border-t pt-4">
        <span className="text-ink-muted text-xs">
          {signUp ? m.auth.orSignIn : m.auth.orSignUp}
        </span>
        <Link
          href={otherHref}
          className="text-accent hover:text-accent-bright text-xs underline underline-offset-4 transition-colors duration-(--duration-quick)"
        >
          {signUp ? m.auth.submitPassword : m.auth.submitSignUp}
        </Link>
      </div>
    </form>
  )
}
