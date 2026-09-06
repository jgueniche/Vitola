import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { listComments } from '@/lib/comments/queries'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { CommentForm } from './comment-form'
import { CommentItem } from './comment-item'

/**
 * The talk page of a cigar entry (ADR 0005), and the report control that the
 * same ADR makes inseparable from it.
 *
 * Titled "Discussion de la fiche" and introduced by a sentence since the
 * design audit of 5 septembre 2026, because the sheet now shows two lists of
 * what people wrote — the notebook entries above (impressions of the cigar)
 * and this one (the sheet itself: a construction, a smoke, a value that does
 * not match) — and nothing said why there were two, nor where to write what.
 *
 * The order of the parts is the argument of the ADR, laid out: what has been
 * said, then the rule under which one may speak, then the box to speak in. A
 * form placed first would read as an invitation to add an opinion; placed last,
 * it reads as joining a conversation already in progress.
 *
 * A visitor gets one sentence and one link, not a third bordered invitation:
 * the rail already carries the one sign-in card of the page.
 *
 * Nothing here filters on visibility or on the entry's status — `listComments`
 * explains why at length. What this component does decide is who is *shown* a
 * control, which is an interface question and not a security one.
 */
export async function CommentThread({ cigarId, slug }: { cigarId: string; slug: string }) {
  const [comments, user, slaHours] = await Promise.all([
    listComments(cigarId),
    currentUser(),
    reportSlaHours(),
  ])

  const count =
    comments.length === 1
      ? m.comments.countOne
      : m.comments.countMany.replace('{count}', String(comments.length))

  return (
    <section aria-labelledby="commentaires" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="commentaires" className="font-display text-display-sm">
            {m.comments.discussionTitle}
          </h2>
          {comments.length > 0 ? <p className="text-ink-faint text-sm">{count}</p> : null}
        </div>
        <p className="text-ink-muted measure text-sm leading-relaxed">
          {m.comments.discussionLede}
        </p>
      </div>

      {comments.length === 0 ? (
        <EmptyState title={m.comments.emptyTitle} description={m.comments.emptyBody} />
      ) : (
        <ul className="border-rule flex flex-col border-t">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              id={comment.id}
              body={comment.body}
              /* A member who has turned off `is_discoverable` has no readable
                 profile row, and that is a choice we honour rather than a gap
                 to fill with their identifier. */
              authorLabel={
                comment.author?.display_name ??
                (comment.author ? `@${comment.author.handle}` : m.comments.authorHidden)
              }
              createdAt={comment.created_at}
              updatedAt={comment.updated_at}
              hidden={comment.hidden_at !== null}
              hiddenReason={comment.hidden_reason}
              isAuthor={user?.id === comment.author_id}
              signedIn={user !== null}
              slug={slug}
              slaHours={slaHours}
            />
          ))}
        </ul>
      )}

      {user ? (
        <CommentForm cigarId={cigarId} slug={slug} />
      ) : (
        <p className="text-ink-muted text-sm">
          {m.comments.signInLine}{' '}
          <Link
            href={`${routes.signIn()}?suite=${encodeURIComponent(routes.cigar(slug))}`}
            className="text-accent-bright underline underline-offset-4"
          >
            {m.comments.signInAction}
          </Link>
        </p>
      )}

      <p className="text-ink-faint measure text-xs leading-relaxed">{m.comments.rule}</p>

      {/* The entry itself is reportable too, and for a different reason than a
          comment: an entry can be inaccurate, or read as promotional. Signed-in
          only — see the route's note on why the mechanism needs a notifier it
          can come back to. */}
      {user ? (
        <div className="border-rule border-t pt-4">
          <ReportDialog
            kind="cigar"
            id={cigarId}
            slaHours={slaHours}
            label={m.moderation.report.triggerCigar}
          />
        </div>
      ) : null}
    </section>
  )
}
