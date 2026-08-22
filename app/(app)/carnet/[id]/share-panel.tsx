import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import type { ReviewVisibility } from '@/lib/reviews/model'
import type { ReviewAuthor, ShareRow } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'

import { removeShare } from '../actions'
import { ShareAddButton } from './share-add-button'

const copy = m.notebook.shares

function label(person: ReviewAuthor | null, fallback: string): string {
  if (!person) return fallback
  return person.display_name ?? `@${person.handle}`
}

/**
 * Naming the people an entry is open to (ADR 0004, D2).
 *
 * A server component, and the search is a `<form method="get">` — the same
 * choice as the faceted search of P1, for the same reasons: no JavaScript, the
 * query survives a refresh, and the result is linkable. `?q=` is read by the
 * page and handed back down as `results`.
 *
 * "À une personne" and "à plusieurs" are not two modes. ADR 0004 turns on that
 * observation: it is one scope, `shared`, with a different number of rows in
 * `review_shares`. So there is one control here and it adds one person at a
 * time, and adding never touches the entry — no UPDATE, no race, and nothing in
 * the entry's history for a gesture that did not change what it says.
 *
 * Two rules are the policies', not this file's, and both are worth knowing
 * while reading it. Only the author may add a row, so a recipient cannot pass
 * the entry on. And there is no UPDATE grant at all on the table: one grants or
 * one withdraws, an authorisation is never amended.
 */
export function SharePanel({
  reviewId,
  visibility,
  shares,
  results,
  query,
}: {
  reviewId: string
  visibility: ReviewVisibility
  shares: ShareRow[]
  results: ReviewAuthor[]
  query: string
}) {
  const named = new Set(shares.map((share) => share.grantee_id))

  return (
    <section aria-labelledby="partages" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="partages" className="font-display text-xl">
          {copy.title}
        </h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        {/* Said plainly rather than by hiding the panel: a member who has named
            people and then narrowed the scope should still see who is on the
            list, and understand why nobody is reading. */}
        {visibility !== 'shared' ? (
          <p className="text-ink-faint measure text-xs leading-relaxed">{copy.onlyWhenShared}</p>
        ) : null}
      </div>

      {shares.length === 0 ? (
        <p className="text-ink-faint text-sm">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shares.map((share) => (
            <li
              key={share.grantee_id}
              className="border-rule flex flex-wrap items-center justify-between gap-3 rounded-[3px] border px-3 py-2"
            >
              <span className="text-ink text-sm">
                {label(share.grantee, m.notebook.entry.authorHidden)}
              </span>
              <form action={removeShare}>
                <input type="hidden" name="reviewId" value={reviewId} />
                <input type="hidden" name="granteeId" value={share.grantee_id} />
                <button
                  type="submit"
                  className="text-ink-faint hover:text-negative text-xs underline underline-offset-4"
                >
                  {copy.remove}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {shares.length > 0 ? (
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.removeNote}</p>
      ) : null}

      <form method="get" action={routes.notebookEntry(reviewId)} className="flex flex-col gap-2">
        <Label htmlFor="share-search">{copy.searchLabel}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="share-search"
            name="q"
            defaultValue={query}
            minLength={2}
            className="max-w-xs"
          />
          <Button type="submit" size="md" variant="secondary">
            {copy.searchAction}
          </Button>
        </div>
        <p className="text-ink-faint text-xs">{copy.searchHint}</p>
      </form>

      {query.trim().length >= 2 ? (
        results.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.searchNoResult}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((person) => (
              <li
                key={person.id}
                className="border-rule bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[3px] border px-3 py-2"
              >
                <span className="flex flex-col">
                  <span className="text-ink text-sm">{label(person, person.handle)}</span>
                  <span className="text-ink-faint text-xs">@{person.handle}</span>
                </span>

                {named.has(person.id) ? (
                  <span className="text-ink-faint text-xs">{copy.title}</span>
                ) : (
                  <ShareAddButton reviewId={reviewId} granteeId={person.id} />
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
