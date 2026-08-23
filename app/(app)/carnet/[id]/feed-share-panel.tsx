'use client'

// useActionState: the outcome is a sentence and, on success, a link to what was
// just published. Both belong next to the button that produced them.
import { useActionState } from 'react'

import { shareEntryToFeed, type PostState } from '@/app/(app)/fil/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { canReachFeed } from '@/lib/social/model'
import type { ReviewVisibility } from '@/lib/reviews/model'
import { routes } from '@/lib/routes'

const copy = m.feed.share

/**
 * « Publier au fil » — the bridge ADR 0004 asked P3 to build.
 *
 * There is no scope control here, and its absence is the decision. The
 * publication takes the entry's scope, the trigger keeps the two equal for the
 * rest of their lives, and offering a choice would be offering to widen an
 * audience by accident — the policy would refuse the wide half with a `42501`
 * nobody could act on.
 *
 * An entry too narrow to publish gets the sentence rather than a disabled
 * button. A disabled control says "not now" and leaves the reader to guess
 * which of the four scopes is the problem; the sentence names the two that work
 * and says why the other two cannot.
 */
export function FeedSharePanel({
  reviewId,
  visibility,
  existingPostId,
}: {
  reviewId: string
  visibility: ReviewVisibility
  /** The publication that already points at this entry, if there is one. */
  existingPostId: string | null
}) {
  const [state, action, pending] = useActionState<PostState, FormData>(shareEntryToFeed, {})

  const publishable = canReachFeed(visibility)
  const postId = state.id ?? existingPostId

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl">{copy.title}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {!publishable ? (
        <p
          role="note"
          className="border-caution text-ink-muted measure border-l-2 pl-3 text-sm leading-relaxed"
        >
          {copy.tooNarrow}
        </p>
      ) : postId ? (
        <div className="flex flex-col gap-2">
          {state.done ? <FieldStatus>{copy.done}</FieldStatus> : null}
          <p className="text-ink-muted text-sm">{state.done ? null : copy.already}</p>
          <p className="text-sm">
            <a href={routes.post(postId)} className="text-accent hover:underline">
              {copy.openPost}
            </a>
          </p>
          <p className="text-ink-faint measure text-xs leading-relaxed">{copy.scopeFollows}</p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="reviewId" value={reviewId} />
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {copy.submit}
            </Button>
          </div>
          <p className="text-ink-faint measure text-xs leading-relaxed">{copy.scopeFollows}</p>
        </form>
      )}
    </div>
  )
}
