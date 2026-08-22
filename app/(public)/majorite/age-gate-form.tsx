'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { confirmAge, type AgeGateState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {m.ageGate.submit}
    </Button>
  )
}

export function AgeGateForm({ suite }: { suite: string }) {
  const [state, formAction] = useActionState<AgeGateState, FormData>(confirmAge, {})
  const errorId = 'age-gate-error'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="birthDate">{m.ageGate.label}</Label>
        <Input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          autoComplete="bday"
          className="max-w-60"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
        {state.error ? <FieldError id={errorId}>{state.error}</FieldError> : null}
      </div>

      <div className="flex items-center gap-4">
        <SubmitButton />
        <a
          href="https://www.tabac-info-service.fr"
          className="text-ink-muted hover:text-ink text-sm underline underline-offset-4"
        >
          {m.ageGate.leave}
        </a>
      </div>
    </form>
  )
}
