'use client'

// useTransition, not useActionState: the button has no message to render back.
// A form whose whole result is the revalidated page it sits in cannot hold
// returned state — the same reasoning as `comment-item.tsx`, where watching a
// returned value to close an editor runs into `react-hooks/set-state-in-effect`.
import { useTransition } from 'react'

import { toggleEmber } from '@/app/(app)/fil/actions'
import { m } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const copy = m.feed.ember

/**
 * La braise — §5.6's reaction, named for what a cigar does rather than for what
 * a social network does.
 *
 * The count lives on the card next to it rather than inside the button, and
 * that is deliberate: the button is a toggle whose label says which way it will
 * move, and a label that also carried a number would change size on every
 * click. `aria-pressed` is what tells a screen reader the state, which a
 * changing label would only imply.
 */
export function EmberButton({
  postId,
  embered,
  count,
}: {
  postId: string
  embered: boolean
  count: number
}) {
  const [pending, start] = useTransition()

  return (
    <form
      action={(formData) => {
        start(async () => {
          await toggleEmber({}, formData)
        })
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      {/* The state to reach, not the state we are in: the server does not have
          to read anything to know what was asked. Two clicks racing therefore
          converge instead of alternating. */}
      <input type="hidden" name="on" value={embered ? '0' : '1'} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={embered}
        aria-label={count === 0 ? copy.countNone : undefined}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-xs',
          'transition-colors duration-(--duration-quick) disabled:opacity-50',
          embered
            ? 'border-accent text-accent'
            : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
        )}
      >
        {embered ? copy.remove : copy.add}
      </button>
    </form>
  )
}
