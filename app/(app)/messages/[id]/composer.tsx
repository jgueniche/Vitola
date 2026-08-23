'use client'

import { useActionState } from 'react'

import { sendMessage, type MessageState } from '@/app/(app)/messages/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { MESSAGE_LIMITS } from '@/lib/social/groups'

const copy = m.messaging.compose

/**
 * The reply box.
 *
 * `useActionState` rather than a redirect, unlike most of this section: sending
 * a message does not remove the control that sent it — the box is still there,
 * ready for the next one — so returned state is read, and React 19 clears the
 * form after the action, which is what one wants here.
 */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState<MessageState, FormData>(sendMessage, {})

  return (
    <form
      action={action}
      className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="message-body">{copy.legend}</Label>
        <Textarea
          id="message-body"
          name="body"
          maxLength={MESSAGE_LIMITS.bodyMax}
          placeholder={copy.placeholder}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{m.messaging.done.sent}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
