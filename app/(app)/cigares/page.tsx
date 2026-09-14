import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { CigarCard } from '@/components/cigar/cigar-card'
import { FacetPanel } from '@/components/cigar/facet-panel'
import { EmptyState } from '@/components/layout/empty-state'
import { SectionHead } from '@/components/layout/section-head'
import { buttonClass } from '@/components/ui/button'
import { listAromaWheel } from '@/lib/aromas/queries'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { accessory, orElse } from '@/lib/degrade'
import { publishedOriginCountries } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'
import {
  facetsToSearchParams,
  FACET_PARAMS,
  isFacetActive,
  parseFacets,
  type RawSearchParams,
} from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'
import { getRole } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: m.referential.cigarsTitle }

/**
 * The faceted search (§9, P1), and since 12 septembre 2026 the front door of
 * the whole referential — the Découvrir hub that used to sit in front of it
 * is a 308 to here, and its six sections are the row of links below the title.
 *
 * A Server Component reading `searchParams`: there is no client JavaScript on
 * this page. Facets are links, the text box is a plain GET form, and the
 * result is therefore shareable and works before hydration.
 *
 * **What a signed-out visitor gets, and the boundary that did not move.** The
 * QA session asked for « Cigares : on en mets quelques uns, puis vous
 * connecter ». So a visitor sees `VISITOR_PREVIEW` sheets and an invitation
 * instead of the facets and the pages. This is a SIGN-IN wall, not an age
 * wall: `/cigares` stays behind the 18+ portal, because rule 1 of the root
 * CLAUDE.md and §2 of the brief put the tobacco referential there and nothing
 * in a QA session moves that. `tests/unit/routes.test.ts` asserts it.
 */

/** Enough to show what the referential is; not enough to be the referential. */
const VISITOR_PREVIEW = 9

export default async function CigarsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const facets = parseFacets(await searchParams)
  const user = await currentUser()

  /*
   * `searchCigars` is the SUBJECT: this page is the search, and a search that
   * could not run must fail rather than render an empty result set — which on
   * a referential of 940 sheets would read as « nothing matches ».
   *
   * The two facet sources ACCOMPANY it. This is the read that produced the
   * second line of the 14 septembre log (« Could not read the origin facet:
   * Bad Gateway »), and the one the audit believed had degraded gracefully.
   * It had not: it threw like the other, and only the moment of the flush
   * differed. Now it degrades, and says so.
   *
   * The role falls back CLOSED, per ADR 0020's second exception: a failure
   * never opens a door, so an unreadable role is a plain member.
   */
  const [result, countries, aromaFamilies, role] = await Promise.all([
    searchCigars(facets),
    accessory(publishedOriginCountries()),
    accessory(listAromaWheel()),
    user ? accessory(getRole(user.id)) : Promise.resolve({ ok: true, value: 'member' } as const),
  ])

  /* An empty field is a task, not information (QA du 12 septembre 2026). The
     role is read once, here, and the card is told — a card does not decide
     who sees what. */
  const showGaps = hasMinRole(orElse(role, 'member'), 'editor')

  const hasFilters = isFacetActive(facets)
  const nothingPublishedAtAll = result.total === 0 && !hasFilters
  const shown = user ? result.cigars : result.cigars.slice(0, VISITOR_PREVIEW)

  return (
    <main id="contenu" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      {/* No lede. The QA session of 14 septembre 2026 struck the four
          documentation counts — « supprime tout c'est pas joli » — and the
          title carries the page on its own. Removing them also removed the
          four `count: exact, head: true` round trips they cost, which is a
          consequence and was not the reason. */}
      <SectionHead eyebrow={m.referential.eyebrow} title={m.referential.cigarsTitle} />

      {/* The referential's own sections, as a row of links rather than a hub
          page in front of them. The wheel and the vitolario are here because
          the QA session put them here: « la roue des arômes le faire dans
          cigares, et pareil pour le vitolario ». */}
      <nav aria-label={m.referential.sections.label} className="border-rule border-y py-2.5">
        <ul className="text-ink-muted flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {[
            { label: m.referential.sections.brands, href: routes.brands() },
            { label: m.referential.sections.vitolas, href: routes.vitolas() },
            { label: m.referential.sections.aromas, href: routes.aromas() },
            { label: m.referential.sections.boxCodes, href: routes.boxCodes() },
            { label: m.referential.sections.compare, href: routes.cigarCompare() },
            { label: m.referential.sections.contribute, href: routes.contributions() },
          ].map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="hover:text-ink transition-colors duration-(--duration-quick)"
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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
          className="border-rule bg-surface text-ink placeholder:text-ink-faint focus:border-accent rounded-band min-w-64 flex-1 border px-3 py-2 outline-none"
        />
        {/* The active facets ride along, so searching does not silently reset them. */}
        {[...facetsToSearchParams({ ...facets, query: '', page: 1 })].map(([key, value]) => (
          <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
        ))}
        <button
          type="submit"
          className="border-accent bg-accent text-on-accent rounded-band border px-4 py-2 text-sm"
        >
          {m.referential.search.submit}
        </button>
      </form>

      <div className={user ? 'grid gap-10 md:grid-cols-[16rem_1fr]' : 'grid gap-10'}>
        {/* A visitor gets no facets: they lead to pages a visitor cannot page
            through, and a control that narrows a preview narrows nothing. */}
        {user ? (
          <FacetPanel
            facets={facets}
            countries={countries.ok ? countries.value : []}
            countriesUnavailable={!countries.ok}
            aromaFamilies={aromaFamilies.ok ? aromaFamilies.value : []}
            aromaFamiliesUnavailable={!aromaFamilies.ok}
          />
        ) : null}

        <section className="flex flex-col gap-5" aria-live="polite">
          {user ? (
            <p className="text-ink-muted text-sm">
              {result.total === 1
                ? m.referential.results.one
                : m.referential.results.many.replace('{count}', String(result.total))}
            </p>
          ) : null}

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
              {/* A grid of bands: a list scanned by the eye, not a column of
                  full-width rows read one by one. */}
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((cigar) => (
                  <li key={cigar.id}>
                    <CigarCard cigar={cigar} showGaps={showGaps} />
                  </li>
                ))}
              </ul>

              {!user ? (
                <div className="border-rule flex flex-col items-start gap-3 border-t pt-6">
                  <Band variant="divider" className="max-w-[220px]" />
                  <h2 className="font-display text-display-sm">{m.referential.teaser.title}</h2>
                  <p className="lede">
                    {m.referential.teaser.body
                      .replace('{shown}', formatCount(shown.length))
                      .replace('{total}', formatCount(result.total))}
                  </p>
                  <Link href={routes.signIn()} className={buttonClass({ size: 'lg' })}>
                    {m.referential.teaser.cta}
                  </Link>
                </div>
              ) : result.pageCount > 1 ? (
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
