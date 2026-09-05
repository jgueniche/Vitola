import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { EntryRow } from '@/components/reviews/entry-row'
import { buttonClass } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { REVIEW_SCOPES, type ReviewKind, type ReviewVisibility } from '@/lib/reviews/model'
import {
  listMyNotebook,
  listSharedWithMe,
  myScoreScale,
  type ReviewWithContext,
} from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: m.notebook.title }

const copy = m.notebook

type Search = {
  params?: never
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

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
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-[3px] border px-2.5 py-1 text-sm whitespace-nowrap transition-colors duration-(--duration-quick)',
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}

/**
 * The month an entry belongs to, as a heading: "Septembre 2026".
 *
 * Parsed field by field from `smoked_on` (YYYY-MM-DD) rather than through
 * `new Date(string)`, which reads a bare date as UTC midnight and renders it
 * locally — the trap `formatEffectiveDate` documents. A month heading that
 * puts the 1st of the month in the previous one would be a quiet lie.
 */
function monthOf(smokedOn: string): { key: string; label: string } {
  const match = /^(\d{4})-(\d{2})/.exec(smokedOn)
  if (!match) return { key: smokedOn, label: smokedOn }
  const [, year, month] = match
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(Number(year), Number(month) - 1, 1))
  return { key: `${year}-${month}`, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

function groupByMonth(
  entries: ReviewWithContext[],
): { key: string; label: string; entries: ReviewWithContext[] }[] {
  const groups: { key: string; label: string; entries: ReviewWithContext[] }[] = []
  for (const entry of entries) {
    const month = monthOf(entry.smoked_on)
    const last = groups[groups.length - 1]
    if (last && last.key === month.key) last.entries.push(entry)
    else groups.push({ ...month, entries: [entry] })
  }
  return groups
}

/**
 * Mon carnet — everything one has written, and everything one has been named on.
 *
 * Rebuilt on 5 septembre 2026 from the design audit: one toolbar instead of
 * two rows of chips and a sentence, the entries as rows grouped by month so a
 * notebook reads as a notebook, and the page's one title said once — the old
 * page repeated "Mon carnet" as its section heading.
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
      : copy.countMany.replace('{count}', formatCount(entries.length))

  const groups = groupByMonth(entries)

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">
          {m.nav.mine.label} · {copy.eyebrow}
        </p>
        <h1 id="mon-carnet" className="font-display text-display-md leading-tight">
          {copy.title}
        </h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {/* One toolbar on two hairlined rows: what kind, who reads, which scale.
          The scale control moved to /parametres with the other display
          preferences; what stays is the fact and the way to change it. */}
      <div className="border-rule flex flex-col border-t border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="eyebrow">{copy.filters.kind}</span>
            <div className="flex flex-wrap gap-1.5">
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
          <p className="text-ink-muted flex flex-wrap items-center gap-x-2 text-xs">
            {entries.length > 0 ? (
              <>
                <span>{count}</span>
                <span className="text-ink-faint">·</span>
              </>
            ) : null}
            <span>{scale === 100 ? copy.scale.hundred : copy.scale.twenty}</span>
            <Link href={routes.settings()} className="hover:text-ink underline underline-offset-4">
              {m.settings.scaleChange}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
          <span className="eyebrow">{copy.filters.scope}</span>
          <div className="flex flex-wrap gap-1.5">
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
      </div>

      <section aria-labelledby="mon-carnet" className="flex flex-col gap-8">
        {entries.length === 0 ? (
          filtered ? (
            <EmptyState
              title={copy.emptyFilteredTitle}
              description={copy.emptyFilteredBody}
              action={
                <Link href={routes.notebook()} className={buttonClass({ variant: 'secondary' })}>
                  {copy.filtersReset}
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={
                <Link href={routes.cigars()} className={buttonClass({})}>
                  {copy.emptyAction}
                </Link>
              }
            />
          )
        ) : (
          groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <h2 className="eyebrow text-accent">{group.label}</h2>
              <div className="border-rule border-t">
                {group.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} scale={scale} showCigar showScope isMine />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="partage" className="flex flex-col gap-4">
        <Band variant="divider">
          <span id="partage" className="eyebrow">
            {copy.sharedWithMeTitle}
          </span>
        </Band>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.sharedWithMeLede}</p>

        {shared.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.sharedWithMeEmpty}</p>
        ) : (
          <div className="border-rule border-t">
            {shared.map((entry) => (
              <EntryRow key={entry.id} entry={entry} scale={scale} showCigar showAuthor />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
