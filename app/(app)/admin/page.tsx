import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { adminCounts } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { modQueueWithAge, reportSlaHours } from '@/lib/moderation/queries'
import { routes } from '@/lib/routes'

import { AdminRestricted, adminView } from './shell'

export const metadata: Metadata = { title: m.admin.title }

const copy = m.admin

/**
 * The dashboard — a regrouping, not a power (ADR 0014, D1).
 *
 * Every number is a session read under an existing policy, every link goes to
 * the screen that already owns the work: moderation, the wiki queue, the
 * venues, the journal. The four screens this area adds — flags, accounts,
 * sheets, lines — are the ones that had no screen at all.
 */
export default async function AdminPage() {
  const isAdmin = await adminView(routes.admin())
  if (!isAdmin) return <AdminRestricted />

  const slaHours = await reportSlaHours()
  const [counts, openReports] = await Promise.all([
    adminCounts(),
    modQueueWithAge('open', slaHours),
  ])
  const oldest = openReports[0]

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{copy.dash.queuesTitle}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <Queue
            count={openReports.length}
            label={copy.dash.moderationLabel}
            note={
              oldest
                ? `${copy.dash.moderationSla.replace('{hours}', String(slaHours))} · ${copy.dash.moderationOldest.replace('{age}', `${oldest.ageHours} h`)}`
                : copy.dash.moderationSla.replace('{hours}', String(slaHours))
            }
            href={routes.moderation()}
            link={copy.dash.moderationLink}
          />
          <Queue
            count={counts.revisionsPending}
            label={copy.dash.revisionsLabel}
            href={routes.contributions()}
            link={copy.dash.revisionsLink}
          />
          <Queue
            count={counts.venuesPending}
            label={copy.dash.venuesLabel}
            href={routes.venues()}
            link={copy.dash.venuesLink}
          />
          <Queue
            count={counts.articleDrafts}
            label={copy.dash.articlesLabel}
            href={routes.journalCompose()}
            link={copy.dash.articlesLink}
          />
        </ul>
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{copy.dash.stateTitle}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <Queue
            count={counts.sheetsUnreviewed}
            label={copy.dash.sheetsUnreviewed}
            note={`${counts.sheetsPublished} ${copy.dash.sheetsPublished} · ${counts.sheetsDraft} ${copy.dash.sheetsDraft}`}
            href={routes.adminSheets()}
            link={copy.dash.sheetsLink}
          />
          <Queue
            count={counts.linesTotal}
            label={copy.dash.linesLabel.replace('{draft}', String(counts.linesDraft))}
            href={routes.adminLines()}
            link={copy.dash.linesLink}
          />
          <Queue
            count={counts.accounts}
            label={copy.dash.accountsLabel}
            href={routes.adminAccounts()}
            link={copy.dash.accountsLink}
          />
          <Queue
            count={counts.productsTotal}
            label={copy.dash.shopLabel.replace('{draft}', String(counts.productsDraft))}
            href={routes.adminShop()}
            link={copy.dash.shopLink}
          />
        </ul>
      </section>

      <Band variant="divider" />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">{copy.dash.flagsTitle}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.dash.flagsLede}</p>
        <p className="text-sm">
          <Link href={routes.adminFlags()} className="text-accent underline">
            {copy.dash.flagsLink}
          </Link>
        </p>
      </section>
    </main>
  )
}

function Queue({
  count,
  label,
  note,
  href,
  link,
}: {
  count: number
  label: string
  note?: string
  href: string
  link: string
}) {
  return (
    <li className="border-rule bg-surface flex flex-col gap-1 rounded-[3px] border p-4">
      <p className="text-3xl leading-none font-semibold tabular-nums">{count}</p>
      <p className="text-ink-muted text-sm leading-snug">{label}</p>
      {note ? <p className="text-ink-faint text-xs leading-snug">{note}</p> : null}
      <p className="mt-1 text-sm">
        <Link href={href} className="text-accent underline">
          {link}
        </Link>
      </p>
    </li>
  )
}
