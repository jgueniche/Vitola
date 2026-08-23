import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { moderationConfirmation } from '@/lib/moderation/confirmations'
import type { ModScope } from '@/lib/moderation/model'
import { modQueueWithAge, reportSlaHours, type ModReportRow } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

const copy = m.moderation.desk

export const metadata: Metadata = { title: copy.title }

/**
 * The reporting queue — the screen answer to Q12, and the third piece the DSA
 * asked for after the mechanism and the deadline: someone to read them.
 *
 * The role is read to decide **what to render**, never what may happen: every
 * door of migration 0018 re-checks `has_min_role('moderator')` inside, and a
 * member who forged their way here reads nothing. A member still gets an
 * explanation rather than a blank — the `/journal/ecrire` pattern.
 *
 * The tab lives in the URL (`?onglet=tranches`), like every interface state on
 * a page that writes: deciding a case re-renders this page, and a tab held in
 * a client component would snap back at that exact moment.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function surfaceLabel(row: ModReportRow): string {
  const surfaces = copy.surfaces as Record<string, string>
  return surfaces[`${row.entity_schema}.${row.entity_table}`] ?? row.entity_table
}

export default async function ModerationQueuePage({ searchParams }: Props) {
  const query = await searchParams
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.moderation())}`)
  }

  const account = await getAccount(user.id)
  const isModerator = hasMinRole(account?.role ?? 'member', 'moderator')
  const slaHours = await reportSlaHours()
  const confirmation = moderationConfirmation(query.fait)

  if (!isModerator) {
    return (
      <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display text-4xl leading-tight">{copy.restrictedTitle}</h1>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.restrictedBody}</p>
        </div>
      </main>
    )
  }

  const scope: ModScope =
    (Array.isArray(query.onglet) ? query.onglet[0] : query.onglet) === 'tranches'
      ? 'decided'
      : 'open'
  const rows = await modQueueWithAge(scope, slaHours)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">
          {copy.lede.replace('{hours}', String(slaHours))}
        </p>
      </div>

      {confirmation ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {confirmation}
        </p>
      ) : null}

      <nav aria-label={copy.title} className="flex gap-2">
        <Link
          href={routes.moderation()}
          aria-current={scope === 'open' ? 'page' : undefined}
          className={`rounded-[3px] border px-3 py-1.5 text-sm ${
            scope === 'open' ? 'border-ink text-ink' : 'border-rule text-ink-muted'
          }`}
        >
          {copy.tabOpen}
        </Link>
        <Link
          href={`${routes.moderation()}?onglet=tranches`}
          aria-current={scope === 'decided' ? 'page' : undefined}
          className={`rounded-[3px] border px-3 py-1.5 text-sm ${
            scope === 'decided' ? 'border-ink text-ink' : 'border-rule text-ink-muted'
          }`}
        >
          {copy.tabDecided}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={scope === 'open' ? copy.emptyOpenTitle : copy.emptyDecidedTitle}
          description={scope === 'open' ? copy.emptyOpenBody : copy.emptyDecidedBody}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const statuses = copy.status as Record<string, string>
            const reasons = m.moderation.report.reasons as Record<string, string>
            return (
              <li key={row.id} className="border-rule rounded-[3px] border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-ink text-sm font-medium">
                    {surfaceLabel(row)} · {reasons[row.reason] ?? row.reason}
                  </p>
                  <p className="text-ink-muted text-xs">
                    {statuses[row.status] ?? row.status}
                    {scope === 'open' ? (
                      <>
                        {' · '}
                        {copy.ageHours.replace('{hours}', String(row.ageHours))}
                        {row.overdue ? (
                          <strong className="text-ink"> · {copy.overdue}</strong>
                        ) : null}
                      </>
                    ) : row.decided_at ? (
                      <> · {copy.case.decidedOn.replace('{date}', formatDateTime(new Date(row.decided_at)))}</>
                    ) : null}
                  </p>
                </div>
                {row.detail ? (
                  <p className="text-ink-muted mt-2 text-sm leading-relaxed">{row.detail}</p>
                ) : null}
                <p className="mt-3">
                  <Link href={routes.moderationReport(row.id)} className="text-ink text-sm underline">
                    {copy.openCase}
                  </Link>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
