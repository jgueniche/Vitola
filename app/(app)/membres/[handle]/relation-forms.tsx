'use client'

// useActionState: each of the four controls has something to say back, and it
// belongs next to the button that produced it. window.confirm guards the two
// that take something away — removing a follower and blocking — because both
// are silent from the other side and neither is obviously undoable.
import { useActionState } from 'react'

import {
  block,
  follow,
  removeFollower,
  unblock,
  unfollow,
  type PersonState,
} from '@/app/(app)/membres/actions'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import type { FollowState } from '@/lib/social/model'

const copy = m.members

/**
 * Everything one may do about another member, in one block.
 *
 * Four controls, and the reason they are here together rather than scattered is
 * that three of them are only correct as a set. ADR 0007 chose a free follow;
 * the removal is its counterweight, and a screen that rendered "s'abonner"
 * without rendering "retirer cet abonné" would have dropped the half that
 * protects. `FollowState` exists so this cannot be got wrong by omission: it
 * carries both directions, and both are read below.
 *
 * `followsMe` and `iFollow` are independent. Someone may follow you without you
 * following them, which is the case that makes the removal necessary and the
 * one easiest to forget while writing the happy path.
 */
export function RelationForms({
  userId,
  handle,
  state: relation,
  retour,
}: {
  userId: string
  handle: string
  state: FollowState
  /** Where to land afterwards. The action validates it before redirecting. */
  retour: string
}) {
  if (relation.blocked) return <UnblockForm userId={userId} handle={handle} retour={retour} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {relation.iFollow ? (
          <Relation
            action={unfollow}
            userId={userId}
            handle={handle}
            retour={retour}
            label={copy.unfollow}
            secondary
          />
        ) : (
          <Relation action={follow} userId={userId} handle={handle} retour={retour} label={copy.follow} />
        )}
      </div>

      {relation.followsMe ? (
        <div className="border-rule flex flex-col gap-2 border-t pt-4">
          <p className="text-ink-muted text-sm">{copy.followsYou}</p>
          <Relation
            action={removeFollower}
            userId={userId}
            handle={handle}
            retour={retour}
            label={copy.removeFollower}
            confirm={copy.removeFollowerConfirm}
            secondary
          />
          <p className="text-ink-faint measure text-xs leading-relaxed">
            {copy.removeFollowerHint}
          </p>
        </div>
      ) : null}

      <div className="border-rule flex flex-col gap-2 border-t pt-4">
        {/* No navigation. Blocking used to hide this very page from the
            person who did it, so the button had to leave — which was the
            symptom of the bug migration 0012 fixed rather than a design. The
            profile now stays readable to whoever posted the block, so staying
            here is right: the page re-renders as the shell plus the notice
            that explains what just happened, with "Débloquer" on it. */}
        <Relation
          action={block}
          userId={userId}
          handle={handle}
          retour={retour}
          label={copy.block}
          confirm={copy.blockConfirm}
          secondary
        />
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.blockHint}</p>
      </div>
    </div>
  )
}

/**
 * What a blocked person's profile offers instead of the four controls.
 *
 * This screen is reachable at all only because migration 0012 made the block
 * one-directional on `profiles`: it hid the profile in both senses at first,
 * which meant that the only place carrying "Débloquer" disappeared the moment
 * one blocked somebody. A block was therefore permanent, and nothing said so.
 * Found by blocking someone in a browser and looking for the way back.
 */
function UnblockForm({
  userId,
  handle,
  retour,
}: {
  userId: string
  handle: string
  retour: string
}) {
  return (
    <div className="border-caution flex flex-col gap-3 border-l-2 pl-4">
      <p className="text-ink-muted measure text-sm leading-relaxed">{copy.blockedNotice}</p>
      <Relation
        action={unblock}
        userId={userId}
        handle={handle}
        retour={retour}
        label={copy.unblock}
        secondary
      />
    </div>
  )
}

/**
 * One control. It still holds a returned state, and only for the refusal.
 *
 * A success never comes back here: the action redirects, and the arrival page
 * renders the confirmation. That is not belt-and-braces — three of these five
 * gestures replace the subtree they were clicked in, so a returned success has
 * nowhere to render. A refusal, on the other hand, leaves everything in place,
 * which is exactly when a message next to the button is the right place for it.
 */
function Relation({
  action,
  userId,
  handle,
  retour,
  label,
  confirm,
  secondary = false,
}: {
  action: (previous: PersonState, formData: FormData) => Promise<PersonState>
  userId: string
  handle: string
  retour: string
  label: string
  confirm?: string
  secondary?: boolean
}) {
  const [state, run, pending] = useActionState<PersonState, FormData>(action, {})

  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="retour" value={retour} />
      <div>
        <Button type="submit" size="sm" variant={secondary ? 'secondary' : 'primary'} disabled={pending}>
          {label}
        </Button>
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
