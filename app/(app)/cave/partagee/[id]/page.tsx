import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'

import { Breadcrumb } from '@/components/layout/breadcrumb'
import { EmptyState } from '@/components/layout/empty-state'
import { formatCount } from '@/lib/format'
import { ageLabel, maturityLabel } from '@/lib/humidor/labels'
import { answersFor, type ShareAnswer } from '@/lib/humidor/model'
import { listReceivedShares, listSharedLots } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { ShareAnswerButton } from '../../share-answer-button'

export const metadata: Metadata = { title: m.humidor.shared.title }

const copy = m.humidor
const shared = m.humidor.shared

type Props = { params: Promise<{ id: string }> }

const LABELS: Record<ShareAnswer, string> = {
  accept: shared.accept,
  decline: shared.decline,
  hide: shared.hide,
  show: shared.show,
  leave: shared.leave,
}

/**
 * A humidor somebody else owns and shared with this member — read-only
 * (ADR 0022).
 *
 * Everything here comes through the two projections of migration 0036, and
 * nothing through the humidor's tables: they are owner-only by any route, and
 * this page could not read a price or a ledger line if it tried. What it shows
 * is what the owner was told the person they invite would see — which cigars,
 * how many, since when.
 *
 * A humidor that was never shared with this member, an invitation not yet
 * accepted, one withdrawn, one across a block: the same 404, for the reason
 * `/cave/[id]` gives — telling somebody that a cave exists at an address they
 * cannot open is telling them something about someone else.
 *
 * Both reads are the subject of the page, so both are bare (ADR 0020): « cette
 * cave est vide » drawn from a failed read is a statement about someone's
 * humidor, and a false one.
 */
export default async function SharedHumidorPage({ params }: Props) {
  const { id } = await params
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.humidorShared(id))}`)
  }

  /* A malformed id would reach the function as a uuid cast and come back a
     500. It is an address that leads nowhere, and says so the same way. */
  if (!z.uuid().safeParse(id).success) notFound()

  const [received, lots] = await Promise.all([listReceivedShares(), listSharedLots(id)])
  const share = received.find((row) => row.humidor_id === id && row.accepted_at !== null)
  if (!share) notFound()

  const held = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const owner =
    share.owner_display_name ?? (share.owner_handle ? `@${share.owner_handle}` : shared.someone)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <Breadcrumb
        trail={[{ label: m.nav.humidor.label, href: routes.humidor() }]}
        className="-mb-4"
      />

      <div className="flex flex-col gap-2">
        <p className="eyebrow">{shared.title}</p>
        <h1 className="font-display text-display-md leading-tight">{share.humidor_name}</h1>
        <p className="text-ink-muted text-sm">
          {share.owner_handle ? (
            <Link href={routes.member(share.owner_handle)} className="text-accent hover:underline">
              {shared.sharedBy.replace('{owner}', owner)}
            </Link>
          ) : (
            shared.sharedBy.replace('{owner}', owner)
          )}
          {' · '}
          {share.capacity
            ? copy.fill
                .replace('{count}', String(held))
                .replace('{capacity}', String(share.capacity))
            : copy.fillNoCapacity.replace('{count}', String(held))}
        </p>
        <p className="lede">{shared.readOnly}</p>
        {share.hidden_at ? (
          <p className="border-rule text-ink-muted border-l-2 py-1 pl-3 text-sm">
            {shared.hiddenNotice}
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.lotsTitle}</h2>

        {lots.length === 0 ? (
          <EmptyState title={shared.emptyTitle} description={shared.emptyBody} />
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {lots.map((lot, index) => (
              <li
                /* The projection returns no lot id — the reader cannot act on
                   a lot, so it has no use for one. Position plus cigar is
                   stable for a render, which is all a key has to be. */
                key={`${lot.cigar_id}-${index}`}
                className="border-rule flex flex-wrap items-baseline justify-between gap-3 border-b py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink">
                    {lot.cigar ? (
                      <Link href={routes.cigar(lot.cigar.slug)} className="hover:text-accent">
                        {lot.cigar.commercial_name}
                      </Link>
                    ) : (
                      m.notebook.entry.unknownCigar
                    )}
                    {lot.cigar?.brand ? (
                      <span className="text-ink-muted"> · {lot.cigar.brand}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-muted text-sm">
                    {ageLabel(lot.aging_days)}
                    {maturityLabel(lot.aging_days) ? ` · ${maturityLabel(lot.aging_days)}` : ''}
                  </span>
                </span>
                <span className="text-base font-medium">{formatCount(lot.qty)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-rule flex flex-wrap items-start gap-3 border-t pt-6">
        {answersFor(share).map((answer) => (
          <ShareAnswerButton
            key={answer}
            humidorId={share.humidor_id}
            answer={answer}
            label={LABELS[answer]}
            confirm={answer === 'leave' ? shared.leaveConfirm : undefined}
            variant={answer === 'leave' ? 'ghost' : 'secondary'}
          />
        ))}
      </section>
    </main>
  )
}
