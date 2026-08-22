import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { EntryCard } from '@/components/reviews/entry-card'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { REVIEW_SCOPES, type ReviewKind, type ReviewVisibility } from '@/lib/reviews/model'
import { listMyNotebook, listSharedWithMe, myScoreScale } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'


export const metadata: Metadata = { title: m.notebook.title }

const copy = m.notebook

type Search = { params?: never; searchParams: Promise<Record<string, string | string[] | undefined>> }

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * A filter, as a link.
 *
 * The faceted search of P1 established the rule and it holds here: filters that
 * are links need no JavaScript, survive a refresh, can be bookmarked, and are
 * back-button correct for free. The state lives in the URL, which is where
 * `app/CLAUDE.md` says interface state lives.
 */
function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-[3px] border px-3 py-1 text-sm transition-colors duration-(--duration-quick)',
        active
          ? 'border-accent text-accent'
          : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}

/**
 * Mon carnet — everything one has written, and everything one has been named on.
 *
 * Two sections rather than one list, because they are two different things: the
 * first is authored, editable and re-scopable; the second is read-only and
 * belongs to someone else. Merging them would make "supprimer" ambiguous on a
 * page where half the rows are not yours to delete.
 *
 * The second section is also the only way to check that named sharing works.
 * An author can add a recipient and see the row; only the recipient can confirm
 * that the entry actually became readable, and this is where they see it.
 *
 * Signed out redirects to the sign-in page with `suite` set: a personal notebook
 * has nothing to show an anonymous visitor, and an empty state that says "sign
 * in" would be a page pretending to be a destination.
 */
export default async function NotebookPage({ searchParams }: Search) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.notebook())}`)
  }

  const query = await searchParams
  const rawKind = one(query.kind)
  const rawScope = one(query.scope)

  const kind: ReviewKind | undefined =
    rawKind === 'log' || rawKind === 'tasting' ? rawKind : undefined
  const scope = (REVIEW_SCOPES as readonly string[]).includes(rawScope ?? '')
    ? (rawScope as ReviewVisibility)
    : undefined

  const [entries, shared, scale] = await Promise.all([
    listMyNotebook(user.id, { kind, visibility: scope }),
    listSharedWithMe(user.id),
    myScoreScale(user.id),
  ])

  const filtered = kind !== undefined || scope !== undefined

  /** Keeps the other filter when one of them changes. */
  const withFilter = (next: { kind?: string; scope?: string }) => {
    const params = new URLSearchParams()
    const nextKind = 'kind' in next ? next.kind : kind
    const nextScope = 'scope' in next ? next.scope : scope
    if (nextKind) params.set('kind', nextKind)
    if (nextScope) params.set('scope', nextScope)
    const qs = params.toString()
    return qs ? `${routes.notebook()}?${qs}` : routes.notebook()
  }

  const count =
    entries.length === 1
      ? copy.countOne
      : copy.countMany.replace('{count}', String(entries.length))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="eyebrow">{copy.filters.kind}</span>
          <div className="flex flex-wrap gap-2">
            <FilterLink href={withFilter({ kind: undefined })} active={kind === undefined}>
              {copy.filters.kindAll}
            </FilterLink>
            <FilterLink href={withFilter({ kind: 'log' })} active={kind === 'log'}>
              {copy.filters.kindLog}
            </FilterLink>
            <FilterLink href={withFilter({ kind: 'tasting' })} active={kind === 'tasting'}>
              {copy.filters.kindTasting}
            </FilterLink>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="eyebrow">{copy.filters.scope}</span>
          <div className="flex flex-wrap gap-2">
            <FilterLink href={withFilter({ scope: undefined })} active={scope === undefined}>
              {copy.filters.scopeAll}
            </FilterLink>
            {REVIEW_SCOPES.map((value) => (
              <FilterLink key={value} href={withFilter({ scope: value })} active={scope === value}>
                {copy.scope[value]}
              </FilterLink>
            ))}
          </div>
        </div>

        {/* The control moved to /parametres, with the other display
            preferences. What stays is the fact — which scale is in force — and
            the way to change it, so the move costs no discoverability. */}
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 text-sm">
          <span className="eyebrow">{m.notebook.scale.legend}</span>
          <span>{scale === 100 ? m.notebook.scale.hundred : m.notebook.scale.twenty}</span>
          <Link href={routes.settings()} className="text-accent underline">
            {m.settings.scaleChange}
          </Link>
        </p>
      </div>

      <section aria-labelledby="mes-entrees" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="mes-entrees" className="font-display text-2xl">
            {copy.title}
          </h2>
          {entries.length > 0 ? <p className="text-ink-faint text-sm">{count}</p> : null}
        </div>

        {entries.length === 0 ? (
          filtered ? (
            <EmptyState
              title={copy.emptyFilteredTitle}
              description={copy.emptyFilteredBody}
              action={
                <Link href={routes.notebook()}>
                  <Button variant="secondary" size="sm">
                    {copy.filtersReset}
                  </Button>
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={
                <Link href={routes.cigars()}>
                  <Button size="sm">{copy.emptyAction}</Button>
                </Link>
              }
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard entry={entry} scale={scale} showCigar showScope isMine />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="partage" className="flex flex-col gap-4">
        <Band variant="divider" />
        <div className="flex flex-col gap-1">
          <h2 id="partage" className="font-display text-2xl">
            {copy.sharedWithMeTitle}
          </h2>
          <p className="text-ink-muted text-sm">{copy.sharedWithMeLede}</p>
        </div>

        {shared.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.sharedWithMeEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shared.map((entry) => (
              <li key={entry.id}>
                <EntryCard entry={entry} scale={scale} showCigar showAuthor />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
