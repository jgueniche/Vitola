'use client'

// useActionState: a refused reply has to say why without losing what was typed.
import { useActionState, useRef } from 'react'

import { commentOnPost, type PostState } from '@/app/(app)/fil/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { POST_LIMITS } from '@/lib/social/model'

const copy = m.feed.comments

/**
 * A reply under a publication.
 *
 * The box is cleared **only on success**, which is the rule `comment-form.tsx`
 * on the cigar page established: React 19 resets a form after its action
 * returns, so a refused reply would come back with an error message over an
 * empty box, and whoever wrote three paragraphs would have to write them again.
 * The ref restores the text when the action refused.
 */
export function PostCommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState<PostState, FormData>(
    async (previous, formData) => {
      const kept = String(formData.get('body') ?? '')
      const result = await commentOnPost(previous, formData)
      if (!result.done && field.current) field.current.value = kept
      return result
    },
    {},
  )
  const field = useRef<HTMLTextAreaElement>(null)

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="postId" value={postId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="post-comment">{copy.placeholder}</Label>
        <Textarea
          ref={field}
          id="post-comment"
          name="body"
          maxLength={POST_LIMITS.commentMax}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.done}</FieldStatus> : null}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
