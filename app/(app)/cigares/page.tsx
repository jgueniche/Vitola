import type { Metadata } from 'next'
import Link from 'next/link'

import { CigarCard } from '@/components/cigar/cigar-card'
import { FacetPanel } from '@/components/cigar/facet-panel'
import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { buttonClass } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { publishedOriginCountries } from '@/lib/referential/queries'
import { publishedCounts } from '@/lib/search/query'
import { routes } from '@/lib/routes'
import {
  facetsToSearchParams,
  FACET_PARAMS,
  isFacetActive,
  parseFacets,
  type RawSearchParams,
} from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'

export const metadata: Metadata = { title: m.referential.cigarsTitle }

/**
 * The faceted search (§9, P1).
 *
 * A Server Component reading `searchParams`: there is no client JavaScript on
 * this page. Facets are links, the text box is a plain GET form, and the result
 * is therefore shareable and works before hydration.
 *
 * The referential currently holds 940 entries, all `draft`, so an anonymous
 * visitor sees none of them — by design, not by accident. The empty state says
 * which of the two situations they are in: nothing published at all, or filters
 * that match nothing.
 */
export default async function CigarsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const facets = parseFacets(await searchParams)
  const [result, countries, counts] = await Promise.all([
    searchCigars(facets),
    publishedOriginCountries(),
    publishedCounts(),
  ])

  const hasFilters = isFacetActive(facets)
  const nothingPublishedAtAll = result.total === 0 && !hasFilters

  return (
    <main id="contenu" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">{m.referential.eyebrow}</p>
          <h1 className="font-display text-display-md">{m.referential.cigarsTitle}</h1>
          {/* Said up front: how much of the referential is documented is the
              page's own truth, not something to discover by scrolling. */}
          <p className="text-ink-muted measure text-sm leading-relaxed">
            {m.referential.results.lede
              .replace('{total}', formatCount(counts.total))
              .replace('{withVitola}', formatCount(counts.withVitola))}
          </p>
        </div>
        {/* The comparator is reached from here because here is where one has
            just seen two sheets worth putting side by side. */}
        <Link href={routes.cigarCompare()} className={buttonClass({ variant: 'secondary' })}>
          {m.compare.title}
        </Link>
      </div>

      <Band variant="divider" />

      {/* GET, so a search is a URL. No action handler, no client state. */}
      <form action={routes.cigars()} method="get" className="flex flex-wrap gap-3">
        <label htmlFor="q" className="sr-only">
          {m.referential.search.label}
        </label>
        <input
          id="q"
          type="search"
          name={FACET_PARAMS.query}
          defaultValue={facets.query}
          placeholder={m.referential.search.placeholder}
          className="border-rule bg-surface text-ink placeholder:text-ink-faint focus:border-accent min-w-64 flex-1 rounded-[3px] border px-3 py-2 outline-none"
        />
        {/* The active facets ride along, so searching does not silently reset them. */}
        {[...facetsToSearchParams({ ...facets, query: '', page: 1 })].map(([key, value]) => (
          <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
        ))}
        <button
          type="submit"
          className="border-accent bg-accent text-on-accent rounded-[3px] border px-4 py-2 text-sm"
        >
          {m.referential.search.submit}
        </button>
      </form>

      <div className="grid gap-10 md:grid-cols-[16rem_1fr]">
        <FacetPanel facets={facets} countries={countries} />

        <section className="flex flex-col gap-5" aria-live="polite">
          <p className="text-ink-muted text-sm">
            {result.total === 1
              ? m.referential.results.one
              : m.referential.results.many.replace('{count}', String(result.total))}
          </p>

          {nothingPublishedAtAll ? (
            <EmptyState
              title={m.referential.results.emptyTitle}
              description={m.referential.results.emptyBody}
            />
          ) : result.total === 0 ? (
            <EmptyState
              title={m.referential.results.none}
              description={m.referential.results.noneHint}
            />
          ) : (
            <>
              {/* A grid of bands, two across on a desk: a list scanned by the
                  eye, not a column of full-width rows read one by one. */}
              <ul className="grid gap-4 xl:grid-cols-2">
                {result.cigars.map((cigar) => (
                  <li key={cigar.id}>
                    <CigarCard cigar={cigar} />
                  </li>
                ))}
              </ul>

              {result.pageCount > 1 ? (
                <nav
                  className="flex items-center justify-between gap-4 pt-2"
                  aria-label={m.referential.pagination.position
                    .replace('{page}', String(result.page))
                    .replace('{pageCount}', String(result.pageCount))}
                >
                  {result.page > 1 ? (
                    <Link
                      href={`${routes.cigars()}?${facetsToSearchParams({ ...facets, page: result.page - 1 })}`}
                      className="text-ink-muted hover:text-ink text-sm underline underline-offset-4"
                    >
                      {m.referential.pagination.previous}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-ink-faint text-xs">
                    {m.referential.pagination.position
                      .replace('{page}', String(result.page))
                      .replace('{pageCount}', String(result.pageCount))}
                  </span>
                  {result.page < result.pageCount ? (
                    <Link
                      href={`${routes.cigars()}?${facetsToSearchParams({ ...facets, page: result.page + 1 })}`}
                      className="text-ink-muted hover:text-ink text-sm underline underline-offset-4"
                    >
                      {m.referential.pagination.next}
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
