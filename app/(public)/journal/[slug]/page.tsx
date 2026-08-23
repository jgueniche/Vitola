import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { ArticleBody } from '@/components/journal/article-body'
import { formatDate } from '@/lib/format'
import { m } from '@/lib/i18n'
import { parseArticle } from '@/lib/journal/markdown'
import { getArticleBySlug, listArticleLinks } from '@/lib/journal/queries'
import { routes } from '@/lib/routes'

import { hasClearedAgeGate } from '../gate'

const copy = m.journal

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return { title: copy.notFound }
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    /* A gated article never indexes, whatever the Q1 lever says: this is the
       per-row half of the Q13 split (ADR 0012, D3). */
    ...(article.audience === 'gated' ? { robots: { index: false, follow: false } } : {}),
  }
}

/**
 * Un article (ADR 0012).
 *
 * A `gated` row defends itself: the middleware waved this public prefix
 * through, so the page checks the age-gate cookie and sends the reader to
 * `/majorite` with a way back. A draft reaches only its editors — the RLS
 * decides that part, and everyone else falls into this 404.
 */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) notFound()

  if (article.audience === 'gated' && !(await hasClearedAgeGate())) {
    redirect(`${routes.ageGate()}?suite=${encodeURIComponent(routes.journalArticle(slug))}`)
  }

  const links = article.audience === 'gated' ? await listArticleLinks(article.id) : []
  const blocks = parseArticle(article.body_md)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">
          <Link href={routes.journal()} className="hover:text-accent">
            {copy.eyebrow}
          </Link>{' '}
          · {copy.categories[article.category]}
        </p>
        <h1 className="font-display text-4xl leading-tight">{article.title}</h1>
        <p className="text-ink-faint text-xs tabular-nums">
          {article.status === 'draft' ? (
            <span className="eyebrow">{copy.draftBadge} · </span>
          ) : null}
          {article.published_at
            ? `${copy.publishedOn} ${formatDate(new Date(article.published_at))}`
            : null}
          {article.reading_time_min
            ? ` · ${copy.readingTime.replace('{min}', String(article.reading_time_min))}`
            : null}
        </p>
        {article.excerpt ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{article.excerpt}</p>
        ) : null}
      </div>

      <Band variant="divider" />

      {article.audience === 'gated' ? (
        <p className="text-ink-faint text-xs leading-relaxed">{copy.gate.banner}</p>
      ) : null}

      <ArticleBody blocks={blocks} />

      {links.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Band variant="divider" />
          <h2 className="font-display text-2xl">{copy.linksTitle}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {links.map((link) => (
              <li key={link.id}>
                {link.cigar ? (
                  <Link
                    href={routes.cigar(link.cigar.slug)}
                    className="text-accent underline underline-offset-4"
                  >
                    {link.cigar.brand ? `${link.cigar.brand} ` : ''}
                    {link.cigar.name}
                  </Link>
                ) : link.venue ? (
                  <Link href={routes.venue(link.venue.slug)} className="text-accent underline underline-offset-4">
                    {link.venue.name}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {article.tags.length > 0 ? (
        <p className="text-ink-faint text-xs">{article.tags.join(' · ')}</p>
      ) : null}
    </main>
  )
}
