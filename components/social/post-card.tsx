import Link from 'next/link'

import { EmberButton } from '@/app/(app)/fil/ember-button'
import { m } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { routes } from '@/lib/routes'
import type { FeedItem } from '@/lib/social/queries'
import { cn } from '@/lib/utils'

const copy = m.feed

/**
 * One publication, as it appears in the feed and on its own page.
 *
 * Every number it renders arrives with the row. `ember_count` and
 * `comment_count` are denormalised columns a trigger recomputes, and
 * `viewer_embered` is answered inside `feed_page()` — so a page of twenty costs
 * one call and not sixty-one. That is the exit criterion of P3 discharged by
 * the shape of the data rather than by a rule this component has to remember.
 *
 * An author that comes back null is not an error and not a deleted account: it
 * is `is_discoverable` turned off, or a block. The card says "Membre" rather
 * than filling the hole with an identifier — the rule `lib/reviews/queries.ts`
 * set when the notebook shipped, and honouring a choice rather than working
 * around it.
 */
export function PostCard({
  post,
  isMine = false,
  standalone = false,
  action,
}: {
  post: FeedItem
  isMine?: boolean
  /** True on the publication's own page, where the title is not a link. */
  standalone?: boolean
  /** Delete, report — rendered by the page that knows which ones apply. */
  action?: React.ReactNode
}) {
  const authorName = post.author_display_name ?? (post.author_handle ? `@${post.author_handle}` : null)
  const embers =
    post.ember_count === 0
      ? copy.ember.countNone
      : post.ember_count === 1
        ? copy.ember.countOne
        : copy.ember.countMany.replace('{count}', String(post.ember_count))
  const comments =
    post.comment_count === 0
      ? copy.comments.countNone
      : post.comment_count === 1
        ? copy.comments.countOne
        : copy.comments.countMany.replace('{count}', String(post.comment_count))

  return (
    <article className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            {post.author_handle ? (
              <Link
                href={routes.member(post.author_handle)}
                className="text-ink hover:text-accent-bright"
              >
                {authorName}
              </Link>
            ) : (
              <span className="text-ink-muted">{copy.post.authorHidden}</span>
            )}
          </p>
          <p className="text-ink-faint text-xs">
            {copy.post.publishedOn} {formatDate(new Date(post.created_at))}
            {post.updated_at !== post.created_at ? ` · ${copy.post.edited}` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow border-rule text-ink-muted rounded-[3px] border px-2 py-0.5 text-xs">
            {copy.kind[post.kind]}
          </span>
          {/* The scope is shown on one's own publications only. On someone
              else's it would be noise — everything one can read is by
              definition within its audience — and on a stranger's it would
              describe a decision that is not the reader's to see. */}
          {isMine ? (
            <span
              className={cn(
                'eyebrow inline-flex items-center rounded-[3px] border px-2 py-0.5 text-xs',
                post.visibility === 'public'
                  ? 'border-accent text-accent'
                  : 'border-caution text-caution',
              )}
            >
              {post.visibility === 'public'
                ? copy.compose.scopePublic
                : copy.compose.scopeFollowers}
            </span>
          ) : null}
        </div>
      </div>

      {post.body ? (
        <p className="text-ink measure text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
      ) : null}

      {post.cigar_slug ? (
        <p className="text-sm">
          <span className="eyebrow text-ink-faint">{copy.post.aboutCigar}</span>{' '}
          <Link href={routes.cigar(post.cigar_slug)} className="text-accent hover:underline">
            {post.brand_name ? `${post.brand_name} ` : ''}
            {post.cigar_name}
          </Link>
        </p>
      ) : null}

      {post.review_id ? (
        <p className="text-sm">
          <Link href={routes.notebookEntry(post.review_id)} className="text-accent hover:underline">
            {copy.post.openEntry}
          </Link>
        </p>
      ) : null}

      <div className="border-rule flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
        <EmberButton postId={post.id} embered={post.viewer_embered} count={post.ember_count} />
        <span className="text-ink-faint text-xs">{embers}</span>

        {standalone ? (
          <span className="text-ink-faint text-xs">{comments}</span>
        ) : (
          <Link href={routes.post(post.id)} className="text-ink-muted hover:text-ink text-xs">
            {comments} · {copy.openPost}
          </Link>
        )}

        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
    </article>
  )
}
