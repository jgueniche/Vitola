// useActionState: an invitation can be refused — already offered, a member who
// no longer exists, a policy that declines — and an « Inviter » that fails in
// silence leaves the owner believing the cave was offered when it was not.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { shareHumidor, type HumidorState } from '../actions'

export function ShareInviteButton({
  humidorId,
  recipientId,
}: {
  humidorId: string
  recipientId: string
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(shareHumidor, {})

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="humidorId" value={humidorId} />
      <input type="hidden" name="recipientId" value={recipientId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {m.humidor.share.invite}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
