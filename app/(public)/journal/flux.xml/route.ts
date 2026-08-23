import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { publicPublishedArticles } from '@/lib/journal/queries'
import { routes } from '@/lib/routes'
import { SITE_ORIGIN } from '@/lib/site'

/**
 * The RSS feed — the subscription v1 offers (ADR 0012, D5: no newsletter
 * without a sender).
 *
 * PUBLIC articles only, like the sitemap, and for the same §2 reason: a feed
 * is fetched by parties who never cleared the age gate, and whatever it
 * carries outlives the page that would have refused them. Titles and excerpts
 * only — the body stays on the page, where its context lives.
 */

export const dynamic = 'force-dynamic'

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export async function GET(): Promise<Response> {
  const articles = await publicPublishedArticles()

  const items = articles
    .map((article) => {
      const url = `${SITE_ORIGIN}${routes.journalArticle(article.slug)}`
      const date = article.published_at ? new Date(article.published_at).toUTCString() : ''
      return [
        '    <item>',
        `      <title>${xmlEscape(article.title)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        article.excerpt ? `      <description>${xmlEscape(article.excerpt)}</description>` : null,
        date ? `      <pubDate>${date}</pubDate>` : null,
        `      <category>${xmlEscape(m.journal.categories[article.category])}</category>`,
        '    </item>',
      ]
        .filter((line): line is string => line !== null)
        .join('\n')
    })
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${xmlEscape(`${BRAND.name} — ${m.journal.title}`)}</title>`,
    `    <link>${xmlEscape(`${SITE_ORIGIN}${routes.journal()}`)}</link>`,
    `    <description>${xmlEscape(m.journal.lede)}</description>`,
    '    <language>fr</language>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
