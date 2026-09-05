import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { DiffView } from '@/components/wiki/diff-view'
import { aromaNameMap } from '@/lib/aromas/queries'
import { StatusBadge } from '@/components/wiki/status-badge'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { getCigarBySlug } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { listForCigar, listLineNames, listVitolaOptions } from '@/lib/wiki/queries'

export const metadata: Metadata = { title: m.contributions.historyTitle }

const copy = m.contributions

type Params = { params: Promise<{ slug: string }> }

/**
 * L'historique d'une fiche — what was proposed on it, and what became of it.
 *
 * Readable by anyone signed in, and what they see is decided by RLS rather than
 * by this page: `cigar_revisions_select_own` and `cigar_revisions_select_editor`
 * are the two SELECT policies, so a member sees the proposals they wrote and an
 * editor sees them all. That is why an ordinary member usually finds this page
 * near-empty and an editor finds it full, from the same query — and why the
 * empty state is written as an invitation rather than as "nothing happened".
 *
 * A public history would be better and is a P3 decision: it needs a policy that
 * exposes somebody else's proposal, which is somebody else's name attached to
 * an opinion about a product. Not something to open by accident.
 */
export default async function HistoryPage({ params }: Params) {
  const { slug } = await params

  const [cigar, user] = await Promise.all([getCigarBySlug(slug), currentUser()])
  if (!cigar) notFound()

  const [revisions, vitolas, lineNames, aromaNames] = await Promise.all([
    user ? listForCigar(cigar.id) : Promise.resolve([]),
    listVitolaOptions(),
    listLineNames(),
    aromaNameMap(),
  ])

  const vitolaNames = new Map(vitolas.map((vitola) => [vitola.id, vitola.name_salida]))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Link href={routes.cigar(slug)} className="eyebrow hover:text-accent-bright w-fit">
          {copy.backToSheet}
        </Link>
        <h1 className="font-display text-display-md leading-tight">{copy.historyTitle}</h1>
        <p className="text-ink-muted text-sm">
          {cigar.brands?.name ? `${cigar.brands.name} · ` : ''}
          {cigar.commercial_name}
        </p>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.historyLede}</p>
      </div>

      <Band variant="divider" />

      {revisions.length === 0 ? (
        <EmptyState
          title={copy.historyEmptyTitle}
          description={copy.historyEmptyBody}
          action={
            user ? (
              <Link href={routes.cigarPropose(slug)}>
                <Button>{copy.proposeTitle}</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-6">
          {revisions.map((revision) => (
            <li key={revision.id} className="border-rule bg-surface rounded-[3px] border p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <StatusBadge status={revision.status} />
                <span className="text-ink-faint text-xs">
                  {copy.proposedOn.replace(
                    '{date}',
                    formatEffectiveDate(revision.created_at.slice(0, 10)),
                  )}
                </span>
              </div>

              <DiffView
                diff={revision.diff}
                vitolaNames={vitolaNames}
                lineNames={lineNames}
                aromaNames={aromaNames}
              />

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
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
