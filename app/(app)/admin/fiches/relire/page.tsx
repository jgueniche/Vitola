import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { SectionHead } from '@/components/layout/section-head'
import { DiffView } from '@/components/wiki/diff-view'
import { SourceLine } from '@/components/wiki/source-line'
import { aromaNameMap } from '@/lib/aromas/queries'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole, REVIEWER_ROLE } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'
import { listLineNames, listPendingSheets, listVitolaOptions } from '@/lib/wiki/queries'

import { DecideForm } from '../../../contributions/decide-forms'
import { ReviewShortcuts } from './review-shortcuts'

export const metadata: Metadata = { title: m.admin.review.title }

const copy = m.admin.review

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The serial review — one sheet at a time, its pending proposals, two keys.
 *
 * Born from the audit of 6 septembre 2026: `/contributions` reads the queue
 * proposal by proposal, with no link to a source and no keyboard, and at seven
 * hundred sheets that is a queue nobody opens. This screen changes the
 * *reading*, never the *rule*: every decision below is `approveRevision` or
 * `rejectRevision` from the queue, with the same freshness check, the same
 * signed trace and the same policies. The only thing it adds to the action is
 * where to land afterwards (`retour`, through `safeSuite()`).
 *
 * Interface state lives in the URL (app/CLAUDE.md): `?fiche=` is the current
 * sheet, `?source=avec` the filter, `?suivante=` the sheet to fall back to
 * once the current one is fully decided, `?decidee=` what just happened. A
 * decision navigates — the form that made it unmounts with its proposal — and
 * the confirmation is read on arrival, `role="status"`.
 *
 * Gated at the reviewer's rung, not the admin's: the right to decide is the
 * editor's (`cigar_revisions_update_editor`), and a screen that refused an
 * editor what the policy grants them would be the /admin nav deciding what may
 * happen — the inversion ADR 0014 forbids. The role read here decides what to
 * RENDER; a member who forged their way to a button writes zero rows.
 */
export default async function SerialReviewPage({ searchParams }: Props) {
  const query = await searchParams
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.adminSheetsReview())}`)
  }
  const account = await getAccount(user.id)
  if (!hasMinRole(account?.role ?? 'member', REVIEWER_ROLE)) {
    return (
      <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
        <SectionHead
          eyebrow={m.admin.eyebrow}
          title={copy.restrictedTitle}
          lede={copy.restrictedBody}
        />
      </main>
    )
  }

  const withSource = first(query.source) === 'avec'
  const wanted = first(query.fiche)
  const fallback = first(query.suivante)
  const decided = first(query.decidee)

  const [sheets, vitolas, lineNames, aromaNames] = await Promise.all([
    listPendingSheets(withSource),
    listVitolaOptions(),
    listLineNames(),
    aromaNameMap(),
  ])
  const vitolaNames = new Map(vitolas.map((vitola) => [vitola.id, vitola.name_salida]))

  /* The current sheet: the one asked for, else the one the last decision
     named as next, else the oldest in the queue. */
  let index = sheets.findIndex((sheet) => sheet.cigar.id === wanted)
  const landedElsewhere = wanted !== undefined && index === -1 && sheets.length > 0
  if (index === -1) index = sheets.findIndex((sheet) => sheet.cigar.id === fallback)
  if (index === -1) index = 0
  const current = sheets[index]
  const previous = index > 0 ? sheets[index - 1] : undefined
  const next = index < sheets.length - 1 ? sheets[index + 1] : undefined

  const base = routes.adminSheetsReview()
  const href = (
    cigarId: string | undefined,
    sourced = withSource,
    extra?: Record<string, string>,
  ) => {
    const params = new URLSearchParams()
    if (cigarId) params.set('fiche', cigarId)
    if (sourced) params.set('source', 'avec')
    for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value)
    const text = params.toString()
    return text ? `${base}?${text}` : base
  }
  const previousHref = previous ? href(previous.cigar.id) : null
  const nextHref = next ? href(next.cigar.id) : null
  /* Where a decision lands: this sheet, with the next one named in case this
     one has nothing left to decide. */
  const retour = current
    ? href(current.cigar.id, withSource, next ? { suivante: next.cigar.id } : undefined)
    : href(undefined)

  const proposalCount = sheets.reduce((sum, sheet) => sum + sheet.revisions.length, 0)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <SectionHead eyebrow={m.admin.eyebrow} title={copy.title} lede={copy.lede} />

      {decided === 'approuvee' || decided === 'refusee' ? (
        <p role="status" className="border-accent text-ink border-l-2 py-1 pl-3 text-sm">
          {decided === 'approuvee' ? copy.approved : copy.rejected}
          {landedElsewhere ? ` ${copy.sheetGone}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-2" aria-label={copy.filterHint}>
          <Link
            href={href(undefined, false)}
            aria-current={!withSource ? 'page' : undefined}
            className={`rounded-[3px] border px-3 py-1.5 text-sm ${
              !withSource
                ? 'border-rule-strong text-ink bg-surface-raised'
                : 'border-rule text-ink-muted hover:text-ink'
            }`}
          >
            {copy.filterAll}
          </Link>
          <Link
            href={href(undefined, true)}
            aria-current={withSource ? 'page' : undefined}
            className={`rounded-[3px] border px-3 py-1.5 text-sm ${
              withSource
                ? 'border-rule-strong text-ink bg-surface-raised'
                : 'border-rule text-ink-muted hover:text-ink'
            }`}
          >
            {copy.filterSourced}
          </Link>
        </nav>
        <p className="text-ink-muted text-sm">
          {copy.counterLede
            .replace('{sheets}', String(sheets.length))
            .replace('{proposals}', String(proposalCount))}
        </p>
      </div>
      <p className="text-ink-faint measure text-xs leading-relaxed">{copy.filterHint}</p>

      {!current ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <>
          <ReviewShortcuts previousHref={previousHref} nextHref={nextHref} />

          <div className="border-rule flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-4">
            <div className="flex flex-col gap-1">
              <p className="eyebrow">
                {copy.counter
                  .replace('{position}', String(index + 1))
                  .replace('{total}', String(sheets.length))}
              </p>
              <h2 className="font-display text-display-sm">{current.cigar.commercial_name}</h2>
              <p className="text-ink-muted text-sm">
                {copy.proposalsOnSheet.replace('{count}', String(current.revisions.length))}
                {' · '}
                <Link
                  href={routes.cigar(current.cigar.slug)}
                  className="underline underline-offset-4"
                >
                  {copy.openSheet}
                </Link>
                {' · '}
                <Link
                  href={routes.cigarHistory(current.cigar.slug)}
                  className="underline underline-offset-4"
                >
                  {copy.openHistory}
                </Link>
              </p>
            </div>
            <nav className="flex flex-wrap gap-4 text-sm" aria-label={copy.title}>
              {previousHref ? (
                <Link
                  href={previousHref}
                  className="text-ink-muted hover:text-ink underline underline-offset-4"
                >
                  ← {copy.previous}
                </Link>
              ) : null}
              {nextHref ? (
                <Link
                  href={nextHref}
                  className="text-ink-muted hover:text-ink underline underline-offset-4"
                >
                  {copy.next} →
                </Link>
              ) : null}
            </nav>
          </div>

          <ul className="border-rule flex flex-col border-b">
            {current.revisions.map((revision, position) => (
              <li key={revision.id} className="border-rule border-t py-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="label">
                    {copy.proposalPosition.replace('{index}', String(position + 1))}
                  </span>
                  <span className="text-ink-faint text-xs">
                    {m.contributions.proposedOn.replace(
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
                {revision.source ? (
                  <SourceLine source={revision.source} />
                ) : (
                  <p className="text-ink-faint mt-3 text-sm">{copy.sourceNone}</p>
                )}
                <DecideForm id={revision.id} retour={retour} shortcuts={position === 0} />
              </li>
            ))}
          </ul>

          {/* The keys, said where they act: a shortcut nobody is told about is a
              shortcut nobody uses, and the accessible name of each button carries
              the same in aria-keyshortcuts. */}
          <dl className="text-ink-muted grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="label">{copy.shortcutsTitle}</dt>
            <dd />
            <dt>
              <kbd className="border-rule rounded-[3px] border px-1.5 py-0.5 font-mono">A</kbd>
            </dt>
            <dd>{copy.shortcutAccept}</dd>
            <dt>
              <kbd className="border-rule rounded-[3px] border px-1.5 py-0.5 font-mono">R</kbd>
            </dt>
            <dd>{copy.shortcutReject}</dd>
            <dt>
              <kbd className="border-rule rounded-[3px] border px-1.5 py-0.5 font-mono">→</kbd>
            </dt>
            <dd>{copy.shortcutNext}</dd>
            <dt>
              <kbd className="border-rule rounded-[3px] border px-1.5 py-0.5 font-mono">←</kbd>
            </dt>
            <dd>{copy.shortcutPrevious}</dd>
            <dt>
              <kbd className="border-rule rounded-[3px] border px-1.5 py-0.5 font-mono">Échap</kbd>
            </dt>
            <dd>{copy.shortcutEscape}</dd>
          </dl>
        </>
      )}
    </main>
  )
}
