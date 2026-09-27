import { Unavailable } from '@/components/layout/unavailable'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import type { HumidorShareRow } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import type { ReviewAuthor } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'

import { revokeHumidorShare } from '../actions'
import { ShareInviteButton } from './share-invite-button'

const copy = m.humidor.share

function label(person: { handle: string; display_name: string | null } | null): string {
  if (!person) return m.humidor.shared.someone
  return person.display_name ?? `@${person.handle}`
}

/**
 * Offering this cave to someone, and seeing who has it (ADR 0022).
 *
 * A server component, and the member search is a `<form method="get">` — the
 * notebook's share panel, for the same reasons: no JavaScript, the query
 * survives the re-render every invitation causes, and the result is linkable.
 * `?membre=` is read by the page and handed down as `results`.
 *
 * What the owner sees of each person is « en attente » or « a accepté », and
 * nothing more. Whether they have hidden the cave since is theirs to know:
 * `hidden_at` is outside the column grant this panel reads through, so the
 * panel could not say it if it tried.
 *
 * Lines, not cards: the design rule of 6 September 2026 — a list of people is a
 * list, and this panel sits inside a page that already has its sections.
 */
export function SharePanel({
  humidorId,
  shares,
  results,
  query,
}: {
  humidorId: string
  /** Null when the read did not answer (ADR 0020) — never an empty list. */
  shares: HumidorShareRow[] | null
  /** Null when the member search did not answer. */
  results: ReviewAuthor[] | null
  query: string
}) {
  const offered = new Set((shares ?? []).map((share) => share.recipient_id))
  const searched = query.trim().length >= 2

  return (
    <section aria-labelledby="partage" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="partage" className="font-display text-display-sm">
          {copy.title}
        </h2>
        <p className="lede">{copy.lede}</p>
      </div>

      {shares === null ? (
        <Unavailable />
      ) : shares.length === 0 ? (
        <p className="text-ink-faint text-sm">{copy.empty}</p>
      ) : (
        <>
          <ul className="border-rule flex flex-col border-t">
            {shares.map((share) => (
              <li
                key={share.recipient_id}
                className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-2"
              >
                <span className="flex flex-col">
                  <span className="text-ink text-sm">{label(share.recipient)}</span>
                  <span className="text-ink-faint text-xs">
                    {share.accepted_at ? copy.accepted : copy.pending}
                  </span>
                </span>
                <form action={revokeHumidorShare}>
                  <input type="hidden" name="humidorId" value={humidorId} />
                  <input type="hidden" name="recipientId" value={share.recipient_id} />
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
          <p className="text-ink-faint measure text-xs leading-relaxed">{copy.removeNote}</p>
        </>
      )}

      <form
        method="get"
        action={`${routes.humidorDetail(humidorId)}#partage`}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="share-member-search">{copy.searchLabel}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="share-member-search"
            name="membre"
            defaultValue={query}
            minLength={2}
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            {copy.searchAction}
          </Button>
        </div>
        <p className="text-ink-faint text-xs">{copy.searchHint}</p>
      </form>

      {searched ? (
        results === null ? (
          <Unavailable />
        ) : results.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.searchNoResult}</p>
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {results.map((person) => (
              <li
                key={person.id}
                className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-2"
              >
                <span className="flex flex-col">
                  <span className="text-ink text-sm">{label(person)}</span>
                  <span className="text-ink-faint text-xs">@{person.handle}</span>
                </span>
                {offered.has(person.id) ? (
                  <span className="text-ink-faint text-xs">{copy.invited}</span>
                ) : (
                  <ShareInviteButton humidorId={humidorId} recipientId={person.id} />
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
