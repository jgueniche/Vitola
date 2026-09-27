import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Figure, FigureRow } from '@/components/data/figures'
import { EmptyState } from '@/components/layout/empty-state'
import { MineTabs } from '@/components/layout/mine-tabs'
import { SectionHead } from '@/components/layout/section-head'
import { Button } from '@/components/ui/button'
import { Unavailable } from '@/components/layout/unavailable'
import { formatPrice } from '@/lib/cigar'
import { accessory } from '@/lib/degrade'
import { formatCount } from '@/lib/format'
import { fillRatio, needsRotation } from '@/lib/humidor/model'
import {
  listAllLots,
  listHumidors,
  listReceivedShares,
  type ReceivedShare,
} from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { humidorConfirmation } from '@/lib/social/confirmations'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { HumidorForm } from './humidor-form'
import { ShareAnswerButton } from './share-answer-button'

export const metadata: Metadata = { title: m.humidor.title }

const copy = m.humidor
const shared = m.humidor.shared

/**
 * Ma cave — every humidor, and what they hold together.
 *
 * The page answers three questions in the order one asks them: how much do I
 * have, where is it, and what needs attention. The inventory itself lives one
 * click away, per humidor: §5.5 asks for several caves, and three lists nested
 * inside a fourth is not a page anybody reads.
 *
 * Signed out redirects rather than showing an empty state. A humidor has
 * nothing to show an anonymous visitor, and "connectez-vous" dressed as a
 * destination is a page pretending to be one — the notebook settled this.
 *
 * Since 26 September 2026 (ADR 0022) the page also holds what others offered:
 * invitations first, because they wait on an answer; the humidors shared with
 * this member after their own, never mixed into them nor into the totals — a
 * figure that added somebody else's stock to yours would be an inventory of
 * nothing anyone owns; and the hidden ones last, folded away. None of them is
 * read from `humidors`, which returns this member's rows and nobody else's
 * since migration 0036: they come through `humidor_shares_received()`.
 */
export default async function HumidorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.humidor())}`)
  }

  const done = humidorConfirmation((await searchParams).fait)

  /* Both bare, and `listAllLots()` deliberately so (ADR 0020): this page is
     « mes caves ET ce qu'elles tiennent ». Degrading the lots would print
     « 0 cigare » and « 0 € » against every humidor — an inventory the reader
     would read as true. A list of humidors claiming an empty stock is worse
     than an error screen, so the stock is part of the subject. */
  const [humidors, lots, sharesRead] = await Promise.all([
    listHumidors(),
    listAllLots(),
    /* What others offered accompanies « mes caves » and is not it: a failed
       read says so in its section, and the reader's own stock still renders. */
    accessory(listReceivedShares()),
  ])

  const received = sharesRead.ok ? sharesRead.value : []
  const invitations = received.filter((share) => share.accepted_at === null)
  const sharedWithMe = received.filter(
    (share) => share.accepted_at !== null && share.hidden_at === null,
  )
  const hidden = received.filter((share) => share.accepted_at !== null && share.hidden_at !== null)

  const totalCigars = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const totalValue = lots.reduce((sum, lot) => sum + (lot.stock_value_eur ?? 0), 0)
  const priced = lots.some((lot) => lot.stock_value_eur !== null)
  const rotating = lots.filter((lot) => needsRotation(lot.aging_days, lot.last_smoked_on))

  const perHumidor = new Map<string, number>()
  for (const lot of lots) {
    perHumidor.set(lot.humidor_id, (perHumidor.get(lot.humidor_id) ?? 0) + lot.qty)
  }

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <MineTabs current="humidor" />

      <SectionHead eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />

      {done ? (
        <p role="status" className="border-accent text-ink border-l-2 py-1 pl-3 text-sm">
          {done}
        </p>
      ) : null}

      {!sharesRead.ok ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-display-sm">{shared.title}</h2>
          <Unavailable />
        </section>
      ) : invitations.length > 0 ? (
        <section aria-labelledby="invitations" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="invitations" className="font-display text-display-sm">
              {shared.invitationsTitle}
            </h2>
            <p className="lede">{shared.invitationsLede}</p>
          </div>
          <ul className="border-rule flex flex-col border-t">
            {invitations.map((share) => (
              <li
                key={share.humidor_id}
                className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink">{share.humidor_name}</span>
                  <span className="text-ink-muted text-sm">
                    {shared.offeredBy.replace('{owner}', ownerName(share))}
                  </span>
                </span>
                <span className="flex flex-wrap items-start gap-2">
                  <ShareAnswerButton
                    humidorId={share.humidor_id}
                    answer="accept"
                    label={shared.accept}
                    variant="primary"
                  />
                  <ShareAnswerButton
                    humidorId={share.humidor_id}
                    answer="decline"
                    label={shared.decline}
                    variant="ghost"
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {humidors.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Link href={routes.cigars()}>
              <Button variant="secondary" size="sm">
                {copy.searchBrowse}
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <FigureRow>
            <Figure value={formatCount(totalCigars)} label={copy.totalCigars} />
            <Figure
              value={priced ? formatPrice(totalValue) : '—'}
              label={copy.totalValue}
              muted={!priced}
            />
            <Figure
              value={
                humidors.length === 1
                  ? copy.countOne
                  : copy.countMany.replace('{count}', String(humidors.length))
              }
              label={copy.eyebrow}
            />
          </FigureRow>

          {rotating.length > 0 ? (
            <p className="text-ink-muted text-sm">
              <span className="text-ink">{copy.rotationFlag}</span> — {copy.rotationHint}{' '}
              {formatCount(rotating.length)}
            </p>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.eyebrow}</h2>
            <ul className="flex flex-col gap-2">
              {humidors.map((humidor) => {
                const held = perHumidor.get(humidor.id) ?? 0
                const ratio = fillRatio(held, humidor.capacity)
                return (
                  <li key={humidor.id}>
                    <Link
                      href={routes.humidorDetail(humidor.id)}
                      className="border-rule hover:border-rule-strong bg-surface flex items-center justify-between gap-4 rounded-[3px] border px-4 py-3 transition-colors duration-(--duration-quick)"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="text-ink">{humidor.name}</span>
                          {humidor.is_default ? (
                            <span className="eyebrow text-accent">{copy.defaultBadge}</span>
                          ) : null}
                        </span>
                        <span className="text-ink-muted text-sm">
                          {humidor.capacity
                            ? copy.fill
                                .replace('{count}', String(held))
                                .replace('{capacity}', String(humidor.capacity))
                            : copy.fillNoCapacity.replace('{count}', String(held))}
                        </span>
                      </span>
                      {ratio !== null ? <Gauge ratio={ratio} /> : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.csvTitle}</h2>
            <p className="lede">{copy.csvLede}</p>
            <div>
              {/* A plain anchor, not a fetch: the export is a route handler
                  that answers with a file, and a browser already knows what to
                  do with one. `download` rather than a new tab, so a CSV that a
                  browser decides to render inline still lands as a file. */}
              <a href={routes.humidorExport()} download>
                <Button variant="secondary">{copy.csvExport}</Button>
              </a>
            </div>
          </section>
        </>
      )}

      {sharedWithMe.length > 0 ? (
        <section aria-labelledby="partagees" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="partagees" className="font-display text-display-sm">
              {shared.title}
            </h2>
            <p className="lede">{shared.lede}</p>
          </div>
          <ul className="border-rule flex flex-col border-t">
            {sharedWithMe.map((share) => (
              <li
                key={share.humidor_id}
                className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
              >
                <Link
                  href={routes.humidorShared(share.humidor_id)}
                  className="group flex flex-col gap-0.5"
                >
                  <span className="text-ink group-hover:text-accent">{share.humidor_name}</span>
                  <span className="text-ink-muted text-sm">
                    {shared.by.replace('{owner}', ownerName(share))} ·{' '}
                    {fillLabel(share.cigar_count ?? 0, share.capacity)}
                  </span>
                </Link>
                <ShareAnswerButton
                  humidorId={share.humidor_id}
                  answer="hide"
                  label={shared.hide}
                  variant="ghost"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hidden.length > 0 ? (
        /* Folded, because it is what the reader asked not to see — and a
           `<details>` rather than a toggle, so it needs no JavaScript and
           nothing to remember. */
        <details className="border-rule border-t pt-4">
          <summary className="text-ink-muted hover:text-ink cursor-pointer text-sm">
            {shared.hiddenTitle.replace('{count}', String(hidden.length))}
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <p className="text-ink-faint measure text-xs leading-relaxed">{shared.hiddenLede}</p>
            <ul className="border-rule flex flex-col border-t">
              {hidden.map((share) => (
                <li
                  key={share.humidor_id}
                  className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-ink">{share.humidor_name}</span>
                    <span className="text-ink-muted text-sm">
                      {shared.by.replace('{owner}', ownerName(share))}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-start gap-2">
                    <ShareAnswerButton
                      humidorId={share.humidor_id}
                      answer="show"
                      label={shared.show}
                    />
                    <ShareAnswerButton
                      humidorId={share.humidor_id}
                      answer="leave"
                      label={shared.leave}
                      confirm={shared.leaveConfirm}
                      variant="ghost"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      <section className="border-rule flex flex-col gap-3 border-t pt-8">
        <h2 className="font-display text-display-sm">{copy.createTitle}</h2>
        <p className="lede">{copy.createLede}</p>
        <HumidorForm mode="create" />
      </section>
    </main>
  )
}

/** Who offered a shared humidor, by the name they chose to show. */
function ownerName(share: ReceivedShare): string {
  if (share.owner_display_name) return share.owner_display_name
  return share.owner_handle ? `@${share.owner_handle}` : shared.someone
}

function fillLabel(held: number, capacity: number | null): string {
  return capacity
    ? copy.fill.replace('{count}', String(held)).replace('{capacity}', String(capacity))
    : copy.fillNoCapacity.replace('{count}', String(held))
}

/** A fill level, drawn rather than written. Capped: over-full is still full. */
function Gauge({ ratio }: { ratio: number }) {
  const percent = Math.min(100, Math.round(ratio * 100))
  return (
    <span className="border-rule-strong h-2 w-24 shrink-0 overflow-hidden rounded-[2px] border">
      <span
        className={cn('block h-full', percent >= 100 ? 'bg-negative' : 'bg-accent')}
        style={{ width: `${percent}%` }}
      />
    </span>
  )
}
