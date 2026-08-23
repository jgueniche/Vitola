'use client'

// useActionState: a refused publication says why in place, and the confirmation
// carries the link to what was just written.
import { useActionState } from 'react'

import { publishSession, type PostState } from '@/app/(app)/fil/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { DEFAULT_POST_SCOPE, POST_LIMITS, POST_SCOPES } from '@/lib/social/model'

const copy = m.feed.session
const composeCopy = m.feed.compose

const SCOPE_LABELS: Record<(typeof POST_SCOPES)[number], string> = {
  followers: composeCopy.scopeFollowers,
  public: composeCopy.scopePublic,
}

/**
 * « Je fume ce cigare » — a feed publication, from the cigar's own page.
 *
 * It lives here rather than in the composer because `posts_session_has_cigar`
 * requires a cigar, and this is the one screen that already has one. The lede
 * says what it is not, because the three gestures on this page look alike from
 * a distance and only one of them is public: rating goes to the notebook and is
 * private by default, smoking one decrements the humidor, and this announces.
 *
 * The body is optional: `posts_has_substance` accepts a publication that shows
 * an object instead of saying something, and "je fume ce cigare" is exactly
 * that publication.
 */
export function SessionForm({ cigarId, slug }: { cigarId: string; slug: string }) {
  const [state, action, pending] = useActionState<PostState, FormData>(publishSession, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="session-body">{composeCopy.body}</Label>
        <Textarea
          id="session-body"
          name="body"
          maxLength={POST_LIMITS.bodyMax}
          placeholder={copy.placeholder}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <legend className="eyebrow mb-1">{composeCopy.scopeLegend}</legend>
        {POST_SCOPES.map((scope) => (
          <label key={scope} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="visibility"
              value={scope}
              defaultChecked={scope === DEFAULT_POST_SCOPE}
              className="accent-accent"
            />
            {SCOPE_LABELS[scope]}
          </label>
        ))}
      </fieldset>

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
