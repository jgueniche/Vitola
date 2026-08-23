'use client'

// useState: one comment can be in two states — read and edit — and the switch
// between them is a local interface concern with no URL worth spending on it.
import { useState, useTransition } from 'react'

import { ReportDialog } from '@/components/moderation/report-dialog'
import { Button } from '@/components/ui/button'
import { FieldError, Textarea } from '@/components/ui/field'
import { formatDate } from '@/lib/format'
import { m } from '@/lib/i18n'

import { deleteComment, editComment } from './actions'

export type CommentItemProps = {
  id: string
  body: string
  authorLabel: string
  createdAt: string
  updatedAt: string
  hidden: boolean
  hiddenReason: string | null
  isAuthor: boolean
  signedIn: boolean
  slug: string
  slaHours: number
}

/**
 * One comment.
 *
 * `isAuthor` decides whether the edit and delete controls are drawn; the RLS
 * policies decide whether they work. Drawing them for the wrong person would be
 * a defect of the interface, not of the security — which is why this prop is
 * allowed to be a plain boolean computed on the server rather than a check.
 *
 * A hidden comment reaches this component only for its own author, through
 * `comments_select_own` — plus the moderators, whose SELECT policy sees
 * everything. It is shown struck through, with its reason, and without edit or
 * delete: one does not edit around a moderation decision. What the author DOES
 * get is a contest path — the DSA requires a decision to be contestable, and a
 * struck line with no recourse is not that. Contesting files a new report
 * (ADR 0013): the moderation walkthrough shipped without this button first,
 * and proved the gap by getting stuck exactly here.
 */
export function CommentItem(props: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const errorId = `comment-${props.id}-error`

  const edited = props.updatedAt !== props.createdAt

  /*
   * The action is called from a transition rather than through
   * `useActionState`, so that a successful save can close the editor from the
   * same place it learns it succeeded. The obvious alternative — an effect
   * watching the returned state — is what React's own lint rule refuses, and
   * rightly: it is a second render to do what the first already knew.
   */
  function save(formData: FormData) {
    startSaving(async () => {
      const result = await editComment(formData)
      if (result.error) return setError(result.error)
      setError(null)
      setEditing(false)
    })
  }

  return (
    <li className="border-rule flex flex-col gap-2 border-b py-5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="eyebrow text-ink">{props.authorLabel}</span>
        <time dateTime={props.createdAt} className="text-ink-faint text-xs">
          {formatDate(new Date(props.createdAt))}
        </time>
        {edited ? (
          <span className="text-ink-faint text-xs">{m.comments.editedSuffix}</span>
        ) : null}
      </div>

      {editing ? (
        <form action={save} className="flex flex-col gap-3">
          <input type="hidden" name="commentId" value={props.id} />
          <input type="hidden" name="slug" value={props.slug} />
          <Textarea
            name="body"
            defaultValue={props.body}
            required
            maxLength={2000}
            aria-label={m.comments.formLabel}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
              {m.comments.save}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {m.comments.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <p
          className={
            props.hidden
              ? 'measure text-ink-faint text-sm leading-relaxed line-through'
              : 'measure text-sm leading-relaxed whitespace-pre-line'
          }
        >
          {props.body}
        </p>
      )}

      {props.hidden ? (
        <div className="flex flex-col gap-2">
          <p className="text-ink-faint text-xs">
            {m.comments.hiddenByModeration.replace(
              '{reason}',
              props.hiddenReason ?? m.comments.hiddenNoReason,
            )}
          </p>
          {props.isAuthor ? (
            <ReportDialog
              kind="comment"
              id={props.id}
              slaHours={props.slaHours}
              label={m.moderation.report.triggerContest}
            />
          ) : null}
        </div>
      ) : null}

      {!editing && !props.hidden ? (
        <div className="flex flex-wrap items-center gap-2">
          {props.isAuthor ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {m.comments.edit}
              </Button>
              <form
                action={deleteComment}
                onSubmit={(event) => {
                  if (!window.confirm(m.comments.deleteConfirm)) event.preventDefault()
                }}
              >
                <input type="hidden" name="commentId" value={props.id} />
                <input type="hidden" name="slug" value={props.slug} />
                <Button variant="ghost" size="sm" type="submit">
                  {m.comments.delete}
                </Button>
              </form>
            </>
          ) : null}

          {/* Not on one's own comment: the button for that is Supprimer. */}
          {props.signedIn && !props.isAuthor ? (
            <ReportDialog kind="comment" id={props.id} slaHours={props.slaHours} />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
