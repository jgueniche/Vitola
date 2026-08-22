'use client'

// useActionState: naming somebody can be refused — by a policy, or because they
// are already named — and a "Nommer" button that fails silently leaves the
// author believing the entry was opened when it was not. Removing needs none of
// this: a withdrawal that worked is visible by the row disappearing.
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'

import { addShare, type EntryState } from '../actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {m.notebook.shares.add}
    </Button>
  )
}

export function ShareAddButton({ reviewId, granteeId }: { reviewId: string; granteeId: string }) {
  const [state, formAction] = useActionState<EntryState, FormData>(addShare, {})

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="granteeId" value={granteeId} />
      <Submit />
      {state.error ? (
        <p role="alert" className="text-negative text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
