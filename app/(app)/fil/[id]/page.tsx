import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { PostCard } from '@/components/social/post-card'
import { m } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { reportSlaHours } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { getPost, listPostComments } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'

import { PostCommentForm } from './comment-form'
import { DeleteCommentForm, DeletePostForm } from './delete-forms'

export const metadata: Metadata = { title: m.feed.title }

const copy = m.feed

/**
 * One publication and the conversation under it.
 *
 * A 404 covers both "no such publication" and "not for you", without
 * distinguishing them — the rule the notebook set for an entry, and it matters
 * more here: a feed publication scoped to someone's followers is exactly the
 * thing an id-guesser would probe for, and "accès refusé" would confirm it
 * exists.
 *
 * Signed out redirects rather than rendering, even though a public publication
 * would be readable: this page carries a reply box, an ember button and a
 * report control, none of which do anything without a session. A page that
 * renders three inert controls is worse than one that asks for a session.
 */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.post(id))}`)
  }

  const post = await getPost(id)
  if (!post) notFound()

  const [comments, slaHours] = await Promise.all([listPostComments(post.id), reportSlaHours()])

  const isMine = post.author_id === user.id

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <p className="text-sm">
          <Link href={routes.feed()} className="text-accent hover:underline">
            {copy.post.backToFeed}
          </Link>
        </p>
      </div>

      <PostCard
        post={post}
        isMine={isMine}
        standalone
        action={
          isMine ? (
            <DeletePostForm id={post.id} redirectTo={routes.feed()} />
          ) : (
            <ReportDialog
              kind="post"
              id={post.id}
              slaHours={slaHours}
              label={m.moderation.report.triggerPost}
            />
          )
        }
      />

      <Band variant="divider" />

      <section aria-labelledby="reponses" className="flex flex-col gap-4">
        <h2 id="reponses" className="font-display text-display-sm">
          {copy.comments.title}
        </h2>

        {comments.length === 0 ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.comments.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => {
              const name =
                comment.author?.display_name ??
                (comment.author ? `@${comment.author.handle}` : copy.post.authorHidden)
              const mine = comment.author_id === user.id

              return (
                <li
                  key={comment.id}
                  className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm">
                      {comment.author ? (
                        <Link
                          href={routes.member(comment.author.handle)}
                          className="text-ink hover:text-accent-bright"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">{name}</span>
                      )}
                    </p>
                    <p className="text-ink-faint text-xs">
                      {formatDate(new Date(comment.created_at))}
                      {comment.updated_at !== comment.created_at ? ` · ${copy.post.edited}` : null}
                    </p>
                  </div>

                  <p className="text-ink text-sm leading-relaxed whitespace-pre-line">
                    {comment.body}
                  </p>

                  <div className="flex flex-wrap items-center gap-4">
                    {mine || isMine ? (
                      <DeleteCommentForm
                        id={comment.id}
                        postId={post.id}
                        asHost={!mine && isMine}
                      />
                    ) : null}
                    {!mine ? (
                      <ReportDialog kind="postComment" id={comment.id} slaHours={slaHours} />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <PostCommentForm postId={post.id} />
      </section>
    </main>
  )
}
