import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { journalConfirmation } from '@/lib/journal/confirmations'
import { getArticleById, listArticleLinks, listDrafts } from '@/lib/journal/queries'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole, REVIEWER_ROLE } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

import { publishArticle, removeArticleLink, unpublishArticle } from './actions'
import { ComposeForm, LinkForm } from './compose-form'
import { DeleteArticleForm } from './controls'

export const metadata: Metadata = {
  title: m.journal.compose.title,
  robots: { index: false, follow: false },
}

const copy = m.journal.compose

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Écrire au journal (ADR 0012).
 *
 * Under the public prefix, and that moves no boundary: the middleware waves
 * the path through, the page requires a session, and every write behind it
 * goes through `articles_insert_editor` and its siblings — a member who
 * reaches this URL sees why it is not for them, which is the `/contributions`
 * rule: hiding the door would make the journal look like a dead end.
 *
 * The role is read to decide what to RENDER, never what may happen.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.journalCompose())}`)
  }

  const account = await getAccount(user.id)
  const isEditor = hasMinRole(account?.role ?? 'member', REVIEWER_ROLE)

  const query = await searchParams
  const done = journalConfirmation(query.fait)
  const articleId = firstParam(query.article)

  const [drafts, article] = isEditor
    ? await Promise.all([
        listDrafts(),
        articleId ? getArticleById(articleId) : Promise.resolve(null),
      ])
    : [[], null]
  const links = article && isEditor ? await listArticleLinks(article.id) : []

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">
          <Link href={routes.journal()} className="hover:text-accent">
            {m.journal.eyebrow}
          </Link>
        </p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {!isEditor ? (
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.reserved}</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-display-sm">{copy.draftsTitle}</h2>
            {drafts.length === 0 ? (
              <p className="text-ink-muted text-sm">{copy.draftsEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {drafts.map((draft) => (
                  <li key={draft.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-ink">{draft.title}</span>
                    <span className="text-ink-faint text-xs">
                      {m.journal.categories[draft.category]}
                      {draft.audience === 'public' ? ` · ${m.journal.publicBadge}` : ''}
                    </span>
                    <Link
                      href={`${routes.journalCompose()}?article=${draft.id}`}
                      className="text-accent hover:underline"
                    >
                      {copy.editLink}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {article ? (
            <section className="border-rule bg-surface flex flex-wrap items-center gap-3 rounded-[3px] border p-4">
              <p className="text-ink-muted flex-1 text-sm">
                {article.status === 'published' ? (
                  <Link
                    href={routes.journalArticle(article.slug)}
                    className="text-accent hover:underline"
                  >
                    {article.title}
                  </Link>
                ) : (
                  <>
                    {m.journal.draftBadge} — {article.title}
                  </>
                )}
              </p>
              {article.status === 'draft' ? (
                <form action={publishArticle}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <Button type="submit">{copy.publish}</Button>
                </form>
              ) : (
                <form action={unpublishArticle}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.unpublish}
                  </Button>
                </form>
              )}
              <DeleteArticleForm articleId={article.id} />
            </section>
          ) : null}

          <ComposeForm
            key={article ? `${article.id}-${article.updated_at}` : 'new'}
            article={article}
          />

          {article ? (
            article.audience === 'gated' ? (
              <section className="flex flex-col gap-3">
                <Band variant="divider" />
                {links.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {links.map((link) => (
                      <li key={link.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {link.cigar
                            ? `${link.cigar.brand ? `${link.cigar.brand} ` : ''}${link.cigar.name}`
                            : (link.venue?.name ?? '')}
                        </span>
                        <form action={removeArticleLink}>
                          <input type="hidden" name="linkId" value={link.id} />
                          <input type="hidden" name="articleId" value={article.id} />
                          <button type="submit" className="text-accent text-xs hover:underline">
                            {copy.linkRemove}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <LinkForm articleId={article.id} />
                <p className="text-ink-faint text-xs">{copy.linkCigarHint}</p>
              </section>
            ) : (
              <p className="text-ink-faint text-xs">{copy.linkOnPublic}</p>
            )
          ) : null}
        </>
      )}
    </main>
  )
}
