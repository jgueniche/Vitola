'use client'

// window.confirm before a delete that cascades: embers and replies go with the
// publication, and nothing on the page says how many until they are gone.
// useTransition rather than useActionState — the form disappears with its row,
// so there is nothing left to render a returned message into.
import { useTransition } from 'react'

import { deletePost, deletePostComment } from '@/app/(app)/fil/actions'
import { m } from '@/lib/i18n'

const copy = m.feed

/**
 * Deletes a publication, then leaves the page.
 *
 * `redirect` happens server-side inside the action for the notebook's editor;
 * here the action stays on the page because the feed is where one lands anyway.
 * The confirmation names what else disappears, because a cascade nobody
 * mentioned is a cascade nobody agreed to.
 */
export function DeletePostForm({ id, redirectTo }: { id: string; redirectTo: string }) {
  const [pending, start] = useTransition()

  return (
    <form
      action={(formData) => {
        if (!window.confirm(copy.post.deleteConfirm)) return
        start(async () => {
          const result = await deletePost({}, formData)
          if (result.done) window.location.assign(redirectTo)
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-ink-faint hover:text-negative text-xs disabled:opacity-50"
      >
        {copy.post.delete}
      </button>
    </form>
  )
}

/**
 * Removes one reply.
 *
 * Two labels for one action, because two policies allow it and they are not the
 * same gesture: deleting one's own words, and removing something from under
 * one's own publication. The database does not care which; the person clicking
 * does.
 */
export function DeleteCommentForm({
  id,
  postId,
  asHost,
}: {
  id: string
  postId: string
  asHost: boolean
}) {
  const [pending, start] = useTransition()

  return (
    <form
      action={(formData) => {
        if (!window.confirm(copy.comments.deleteConfirm)) return
        start(async () => {
          await deletePostComment({}, formData)
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        disabled={pending}
        className="text-ink-faint hover:text-negative text-xs disabled:opacity-50"
      >
        {asHost ? copy.comments.deleteHost : copy.comments.delete}
      </button>
    </form>
  )
}
