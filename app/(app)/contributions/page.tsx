import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { DiffView } from '@/components/wiki/diff-view'
import { StatusBadge } from '@/components/wiki/status-badge'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole, REVIEWER_ROLE } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'
import {
  listMine,
  listPending,
  listVitolaOptions,
  type RevisionWithCigar,
} from '@/lib/wiki/queries'

import { DecideForm, WithdrawForm } from './decide-forms'

export const metadata: Metadata = { title: m.contributions.title }

const copy = m.contributions

/* The ladder lives in `lib/settings/roles.ts` since the promotion screen shipped:
   two lists of role names that must agree is one list too many, and this one was
   the copy. `hasMinRole` compares by rung, so a role added above `editor` is
   included without anybody remembering to add it here. */

/**
 * Contributions — what I proposed, and, for a reviewer, what is waiting.
 *
 * The role is read to decide **what to render**, never to decide what may
 * happen: every write below goes through a policy that checks the role again,
 * and a member who forged their way to the approve button writes nothing. That
 * separation is why this comparison is allowed to be a plain string check.
 *
 * A member who is not an editor still sees the queue section — as an
 * explanation of what it is and how one comes to review. Hiding it entirely
 * would make the contribution path look like a dead end, which is the opposite
 * of what a wiki wants.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ContributionsPage({ searchParams }: Props) {
  const query = await searchParams
  const decided = Array.isArray(query.decidee) ? query.decidee[0] : query.decidee
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.contributions())}`)
  }

  const account = await getAccount(user.id)
  const isEditor = hasMinRole(account?.role ?? 'member', REVIEWER_ROLE)

  const [mine, pending, vitolas] = await Promise.all([
    listMine(user.id),
    isEditor ? listPending() : Promise.resolve([]),
    listVitolaOptions(),
  ])

  const vitolaNames = new Map(vitolas.map((vitola) => [vitola.id, vitola.name_salida]))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {/* What just happened, carried by the URL because the form that did it is
          no longer on the page. `role="status"` so it is announced, like every
          other confirmation in the app. */}
      {decided === 'approuvee' || decided === 'refusee' ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {decided === 'approuvee' ? copy.approved : copy.rejected}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.mineTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.mineLede}</p>
        </div>

        {mine.length === 0 ? (
          <EmptyState
            title={copy.mineEmptyTitle}
            description={copy.mineEmptyBody}
            action={
              <Link href={routes.cigars()}>
                <Button variant="secondary" size="sm">
                  {m.humidor.searchBrowse}
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {mine.map((revision) => (
              <li key={revision.id} className="border-rule bg-surface rounded-[3px] border p-4">
                <Header revision={revision} />
                <DiffView diff={revision.diff} vitolaNames={vitolaNames} />
                {revision.comment ? (
                  <p className="text-ink-muted measure mt-3 text-sm leading-relaxed">
                    {revision.comment}
                  </p>
                ) : null}
                {revision.review_comment ? (
                  <p className="border-rule text-ink-muted measure mt-3 border-l-2 pl-3 text-sm leading-relaxed">
                    <span className="eyebrow block">{copy.reviewComment}</span>
                    {revision.review_comment}
                  </p>
                ) : null}
                {revision.status === 'pending' ? (
                  <div className="mt-3">
                    <WithdrawForm id={revision.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.queueTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.queueLede}</p>
        </div>

        {!isEditor ? (
          <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border px-4 py-4">
            <p className="eyebrow">{copy.notEditorTitle}</p>
            <p className="text-ink-muted measure text-sm leading-relaxed">{copy.notEditorBody}</p>
          </div>
        ) : pending.length === 0 ? (
          <EmptyState title={copy.queueEmptyTitle} description={copy.queueEmptyBody} />
        ) : (
          <>
            <p className="eyebrow">
              {copy.queueCount.replace('{count}', String(pending.length))}
            </p>
            <ul className="flex flex-col gap-4">
              {pending.map((revision) => (
                <li key={revision.id} className="border-rule bg-surface rounded-[3px] border p-4">
                  <Header revision={revision} />
                  <DiffView diff={revision.diff} vitolaNames={vitolaNames} />
                  {revision.comment ? (
                    <p className="text-ink-muted measure mt-3 text-sm leading-relaxed">
                      {revision.comment}
                    </p>
                  ) : null}
                  <DecideForm id={revision.id} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}

function Header({ revision }: { revision: RevisionWithCigar }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <span className="flex flex-wrap items-baseline gap-3">
        <StatusBadge status={revision.status} />
        {revision.cigar ? (
          <Link
            href={routes.cigar(revision.cigar.slug)}
            className="hover:text-accent-bright text-sm"
          >
            {revision.cigar.commercial_name}
          </Link>
        ) : null}
      </span>
      <span className="text-ink-faint text-xs">
        {copy.proposedOn.replace('{date}', formatEffectiveDate(revision.created_at.slice(0, 10)))}
        {revision.reviewed_at
          ? ` · ${copy.decidedOn.replace('{date}', formatEffectiveDate(revision.reviewed_at.slice(0, 10)))}`
          : ''}
      </span>
    </div>
  )
}
