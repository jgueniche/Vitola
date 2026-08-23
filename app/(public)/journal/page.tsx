import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { listJournal } from '@/lib/journal/queries'
import { formatDate } from '@/lib/format'

import { hasClearedAgeGate } from './gate'

export const metadata: Metadata = {
  title: m.journal.title,
  alternates: { types: { 'application/rss+xml': routes.journalFeed() } },
}

const copy = m.journal

/**
 * Le journal (ADR 0012) — the indexable face of the site, and the page the
 * Lighthouse criterion of P6 is measured on.
 *
 * One address, two audiences (D3): a visitor who has not cleared the gate sees
 * the public articles and a sentence saying more exists behind the portal; one
 * who has sees everything published. The audience filter here is the Q13
 * frontier — an HTTP boundary the database has never heard of — not an RLS
 * double: RLS decides drafts, the cookie decides gated.
 */
export default async function JournalPage() {
  const cleared = await hasClearedAgeGate()
  const articles = await listJournal({ includeGated: cleared })

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="text-sm">
          <a href={routes.journalFeed()} className="text-accent hover:underline">
            {copy.rss}
          </a>
        </p>
      </div>

      <Band variant="divider" />

      {articles.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-4">
          {articles.map((article) => (
            <li
              key={article.id}
              className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="eyebrow text-xs">{copy.categories[article.category]}</p>
                <p className="text-ink-faint text-xs tabular-nums">
                  {article.published_at ? formatDate(new Date(article.published_at)) : null}
                  {article.reading_time_min
                    ? ` · ${copy.readingTime.replace('{min}', String(article.reading_time_min))}`
                    : null}
                </p>
              </div>
              <Link
                href={routes.journalArticle(article.slug)}
                className="font-display text-ink hover:text-accent text-2xl leading-snug transition-colors duration-(--duration-quick)"
              >
                {article.title}
              </Link>
              {article.excerpt ? (
                <p className="text-ink-muted measure text-sm leading-relaxed">{article.excerpt}</p>
              ) : null}
              {article.audience === 'gated' ? (
                <p className="eyebrow text-ink-faint text-xs">{copy.gatedBadge}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!cleared ? (
        <p className="text-ink-muted text-sm leading-relaxed">
          {copy.gatedTeaser}{' '}
          <Link
            href={`${routes.ageGate()}?suite=${encodeURIComponent(routes.journal())}`}
            className="text-accent hover:underline"
          >
            {copy.gatedTeaserLink}
          </Link>
        </p>
      ) : null}
    </main>
  )
}
