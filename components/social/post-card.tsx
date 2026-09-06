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
 * A row under a hairline, like an entry of the notebook — not a card. The
 * card it replaces carried two bordered badges, three tracked-capitals
 * labels and a bordered foot for a text that is often two lines long; the
 * chrome outweighed the words. What a reader needs is who, when, what, and
 * the two counts — one line above the text, one line below it.
 *
 * Every number it renders arrives with the row. `ember_count` and
 * `comment_count` are denormalised columns a trigger recomputes, and
 * `viewer_embered` is answered inside `feed_page()` — so a page of twenty costs
 * one call and not sixty-one. That is the exit criterion of P3 discharged by
 * the shape of the data rather than by a rule this component has to remember.
 *
 * An author that comes back null is not an error and not a deleted account: it
 * is `is_discoverable` turned off, or a block. The row says "Membre" rather
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
  const authorName =
    post.author_display_name ?? (post.author_handle ? `@${post.author_handle}` : null)
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
    <article
      className={cn(
        'border-rule flex flex-col gap-2.5 border-b py-4 first:border-t',
        standalone && 'border-t',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          {post.author_handle ? (
            <Link
              href={routes.member(post.author_handle)}
              className="text-ink hover:text-accent-bright font-medium"
            >
              {authorName}
            </Link>
          ) : (
            <span className="text-ink-muted">{copy.post.authorHidden}</span>
          )}
        </p>
        <p className="text-ink-faint text-xs">
          {copy.kind[post.kind]}
          {' · '}
          {formatDate(new Date(post.created_at))}
          {post.updated_at !== post.created_at ? ` · ${copy.post.edited}` : null}
          {/* The scope is shown on one's own publications only. On someone
              else's it would be noise — everything one can read is by
              definition within its audience — and on a stranger's it would
              describe a decision that is not the reader's to see. */}
          {isMine ? (
            <>
              {' · '}
              <span className={post.visibility === 'public' ? 'text-accent' : 'text-caution'}>
                {post.visibility === 'public'
                  ? copy.compose.scopePublic
                  : copy.compose.scopeFollowers}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {post.body ? (
        <p className="text-ink measure text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
      ) : null}

      {/* What the publication is about, on one line: the cigar, then the
          venue a session names (P5). Both hydrated after the RLS — a place
          the reader may not see renders nothing, and the row does not say so. */}
      {post.cigar_slug || (post.venue_slug && post.venue_name) || post.review_id ? (
        <p className="text-ink-muted text-xs">
          {post.cigar_slug ? (
            <>
              {copy.post.aboutCigar}{' '}
              <Link
                href={routes.cigar(post.cigar_slug)}
                className="text-ink hover:text-accent-bright"
              >
                {post.brand_name ? `${post.brand_name} ` : ''}
                {post.cigar_name}
              </Link>
            </>
          ) : null}
          {post.cigar_slug && post.venue_slug && post.venue_name ? ' · ' : null}
          {post.venue_slug && post.venue_name ? (
            <>
              {copy.atVenue}{' '}
              <Link
                href={routes.venue(post.venue_slug)}
                className="text-ink hover:text-accent-bright"
              >
                {post.venue_name}
              </Link>
            </>
          ) : null}
          {post.review_id ? (
            <>
              {post.cigar_slug || post.venue_slug ? ' · ' : null}
              <Link
                href={routes.notebookEntry(post.review_id)}
                className="text-ink hover:text-accent-bright underline underline-offset-4"
              >
                {copy.post.openEntry}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
        <EmberButton postId={post.id} embered={post.viewer_embered} />
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
