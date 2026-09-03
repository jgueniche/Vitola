import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { acknowledgeReport } from '@/app/(app)/moderation/actions'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'
import { moderationConfirmation } from '@/lib/moderation/confirmations'
import { adminActFor, isHideable } from '@/lib/moderation/model'
import { modReport, reportSlaHours, targetPreview } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'
import { getAccount } from '@/lib/settings/queries'
import { hasMinRole } from '@/lib/settings/roles'
import { currentUser } from '@/lib/supabase/server'

import { DecideForm } from './decide-form'

const copy = m.moderation.desk

export const metadata: Metadata = { title: copy.case.eyebrow }

/**
 * One case: what was reported, what it targets, and the decision.
 *
 * The target is read under the caller's own rights (`targetPreview`), never
 * through a door — ADR 0013, D3. A row RLS withholds renders as "introuvable ou
 * retirée", which tells the moderator something real: either it was deleted, or
 * it lives where even a moderator does not read.
 *
 * Acknowledging is a button, not a side effect of opening the page: a page must
 * not write while it renders, and `acknowledged_at` is the date the deadline
 * looks at — it must mean "a human took the case", not "a link was prefetched".
 */
type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ModerationCasePage({ params, searchParams }: Props) {
  const { id } = await params
  const query = await searchParams
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.moderationReport(id))}`)
  }

  const account = await getAccount(user.id)
  const role = account?.role ?? 'member'
  if (!hasMinRole(role, 'moderator')) {
    redirect(routes.moderation())
  }

  const report = await modReport(id)
  if (!report) notFound()

  const [slaHours, target] = await Promise.all([
    reportSlaHours(),
    targetPreview(report.entity_schema, report.entity_table, report.entity_id),
  ])

  const confirmation = moderationConfirmation(query.fait)
  const surfaces = copy.surfaces as Record<string, string>
  const statuses = copy.status as Record<string, string>
  const reasons = m.moderation.report.reasons as Record<string, string>
  const open = report.status === 'open' || report.status === 'reviewing'
  const hideable = isHideable(report.entity_schema, report.entity_table)
  /* The shop surfaces have no verb on this desk (0024): the act is the
     admin's, under the policies of /admin/boutique. Offered as a link only to
     someone the policy will let through — a door drawn for a moderator who
     cannot open it is the kind of control ADR 0014 refuses. */
  const adminAct = hasMinRole(role, 'admin')
    ? adminActFor(report.entity_schema, report.entity_table, report.entity_id)
    : null

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.case.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">
          {surfaces[`${report.entity_schema}.${report.entity_table}`] ?? report.entity_table}
        </h1>
        <p className="text-ink-muted text-sm">
          {statuses[report.status] ?? report.status}
          {' · '}
          {copy.case.receivedOn.replace('{date}', formatDateTime(new Date(report.created_at)))}
          {report.acknowledged_at
            ? ` · ${copy.case.acknowledgedAt.replace('{date}', formatDateTime(new Date(report.acknowledged_at)))}`
            : null}
        </p>
        <p className="text-ink-muted text-xs">{copy.lede.replace('{hours}', String(slaHours))}</p>
      </div>

      {confirmation ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {confirmation}
        </p>
      ) : null}

      <section className="border-rule flex flex-col gap-2 rounded-[3px] border p-4">
        <h2 className="text-ink text-sm font-medium">{copy.case.reasonLabel}</h2>
        <p className="text-ink text-sm">{reasons[report.reason] ?? report.reason}</p>
        <h2 className="text-ink mt-2 text-sm font-medium">{copy.case.detailLabel}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">
          {report.detail ?? copy.case.noDetail}
        </p>
      </section>

      <section className="border-rule flex flex-col gap-2 rounded-[3px] border p-4">
        <h2 className="text-ink text-sm font-medium">{copy.case.targetTitle}</h2>
        {target ? (
          <>
            {target.title ? <p className="text-ink text-sm font-medium">{target.title}</p> : null}
            {target.byline ? <p className="text-ink-muted text-xs">{target.byline}</p> : null}
            {target.excerpt ? (
              <blockquote className="text-ink-muted measure border-rule border-l-2 pl-3 text-sm leading-relaxed">
                {target.excerpt}
              </blockquote>
            ) : null}
            {target.hidden ? <p className="text-ink text-xs">{copy.case.targetHidden}</p> : null}
            {target.href ? (
              <p>
                <Link href={target.href} className="text-ink text-sm underline">
                  {copy.case.viewInSitu}
                </Link>
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-ink-muted text-sm">{copy.case.targetGone}</p>
        )}
        {adminAct && open ? (
          <p>
            <Link href={adminAct.href} className="text-ink text-sm underline">
              {adminAct.label}
            </Link>
          </p>
        ) : null}
      </section>

      {open ? (
        <>
          {report.acknowledged_at === null ? (
            <form action={acknowledgeReport}>
              <input type="hidden" name="report" value={report.id} />
              <Button type="submit" variant="secondary">
                {copy.case.acknowledge}
              </Button>
            </form>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl">{copy.case.decideTitle}</h2>
              <p className="text-ink-muted measure text-sm leading-relaxed">
                {copy.case.decideLede}
              </p>
            </div>
            <DecideForm
              reportId={report.id}
              hideable={hideable}
              targetHidden={target?.hidden ?? false}
            />
          </section>
        </>
      ) : (
        <section className="border-rule flex flex-col gap-2 rounded-[3px] border p-4">
          <h2 className="text-ink text-sm font-medium">{copy.case.decisionNote}</h2>
          <p className="text-ink-muted text-sm">
            {report.decided_at
              ? copy.case.decidedOn.replace('{date}', formatDateTime(new Date(report.decided_at)))
              : null}
          </p>
          <p className="text-ink measure text-sm leading-relaxed">{report.decision_note}</p>
        </section>
      )}

      <p>
        <Link href={routes.moderation()} className="text-ink-muted text-sm underline">
          ← {copy.title}
        </Link>
      </p>
    </main>
  )
}
