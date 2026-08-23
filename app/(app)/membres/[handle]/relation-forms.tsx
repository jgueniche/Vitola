'use client'

// useActionState for the three that stay on the page and have something to
// say; window.confirm for the two that take something away. Blocking is the
// only one that changes what the reader can see afterwards, so it navigates.
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
import { FieldError, FieldStatus } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
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
}: {
  userId: string
  handle: string
  state: FollowState
}) {
  if (relation.blocked) return <UnblockForm userId={userId} handle={handle} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {relation.iFollow ? (
          <Relation action={unfollow} userId={userId} handle={handle} label={copy.unfollow} secondary />
        ) : (
          <Relation action={follow} userId={userId} handle={handle} label={copy.follow} />
        )}
      </div>

      {relation.followsMe ? (
        <div className="border-rule flex flex-col gap-2 border-t pt-4">
          <p className="text-ink-muted text-sm">{copy.followsYou}</p>
          <Relation
            action={removeFollower}
            userId={userId}
            handle={handle}
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
        <Relation
          action={block}
          userId={userId}
          handle={handle}
          label={copy.block}
          confirm={copy.blockConfirm}
          /* Blocking hides this very page from the person who did it — the
             RESTRICTIVE policy applies on the next render — so staying here
             would show a 404 where a confirmation should be. */
          navigateTo={routes.members()}
          secondary
        />
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.blockHint}</p>
      </div>
    </div>
  )
}

function UnblockForm({ userId, handle }: { userId: string; handle: string }) {
  return (
    <div className="border-caution flex flex-col gap-3 border-l-2 pl-4">
      <p className="text-ink-muted measure text-sm leading-relaxed">{copy.blockedNotice}</p>
      <Relation action={unblock} userId={userId} handle={handle} label={copy.unblock} secondary />
    </div>
  )
}

function Relation({
  action,
  userId,
  handle,
  label,
  confirm,
  navigateTo,
  secondary = false,
}: {
  action: (previous: PersonState, formData: FormData) => Promise<PersonState>
  userId: string
  handle: string
  label: string
  confirm?: string
  navigateTo?: string
  secondary?: boolean
}) {
  const [state, run, pending] = useActionState<PersonState, FormData>(async (previous, data) => {
    const result = await action(previous, data)
    if (result.done && navigateTo) window.location.assign(navigateTo)
    return result
  }, {})

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
      <div>
        <Button type="submit" size="sm" variant={secondary ? 'secondary' : 'primary'} disabled={pending}>
          {label}
        </Button>
      </div>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{state.done}</FieldStatus> : null}
    </form>
  )
}
