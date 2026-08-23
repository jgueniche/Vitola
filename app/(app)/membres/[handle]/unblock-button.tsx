'use client'

// useActionState: lifting a block is a decision, and the confirmation belongs
// next to the button that took it. The row stays on screen until the list
// re-renders, so there is something left to render the message into — unlike
// the notifications page, where the button removes itself.
import { useActionState } from 'react'

import { unblock, type PersonState } from '@/app/(app)/membres/actions'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { m } from '@/lib/i18n'

/**
 * « Débloquer », on its own, for the settings list.
 *
 * A success never comes back here — the action redirects and `/parametres`
 * renders the band, because this row removes itself the moment the block is
 * lifted. Only the refusal has somewhere to land.
 *
 * `RelationForms` already renders one on the profile page, and this is not a
 * duplicate of it: that one is the whole relation block, which only makes sense
 * where the person is. This one is the single control the settings list needs,
 * and the list exists because reaching the profile requires remembering a
 * handle. Sharing the Server Action between them is what keeps the rule in one
 * place; sharing the component would have meant rendering "s'abonner" and
 * "bloquer" inside a list of people one has blocked.
 */
export function UnblockButton({
  userId,
  handle,
  retour,
}: {
  userId: string
  handle: string
  retour: string
}) {
  const [state, action, pending] = useActionState<PersonState, FormData>(unblock, {})

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="retour" value={retour} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {m.settings.blockedUnblock}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
