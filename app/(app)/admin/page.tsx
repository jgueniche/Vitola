import type { Metadata } from 'next'
import Link from 'next/link'

import { SectionHead } from '@/components/layout/section-head'
import { adminCounts } from '@/lib/admin/queries'
import { isFeatureEnabled } from '@/lib/flags'
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
  const [counts, openReports, shopOpen] = await Promise.all([
    adminCounts(),
    modQueueWithAge('open', slaHours),
    isFeatureEnabled('shop_enabled'),
  ])
  const oldest = openReports[0]

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <SectionHead eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />

      {/* The shop first — QA said its administration was invisible, and a
          dashboard is where an admin looks first. State, queue, vendors: each
          number links to the screen that owns the work. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.dash.shopTitle}</h2>
          <p className="lede">{copy.dash.shopLede}</p>
        </div>
        <p
          className={`border-l-2 pl-3 text-sm ${shopOpen ? 'border-accent text-ink' : 'border-rule-strong text-ink'}`}
        >
          <span className="font-semibold">
            {shopOpen ? copy.dash.shopFlagOpen : copy.dash.shopFlagClosed}
          </span>{' '}
          <Link href={routes.adminFlags()} className="text-accent underline">
            {copy.dash.shopFlagLink}
          </Link>
          {' · '}
          <Link href={routes.shop()} className="text-accent underline">
            {copy.dash.shopSeePublic}
          </Link>
        </p>
        <ul className="border-rule grid gap-x-8 gap-y-5 border-t border-b py-4 sm:grid-cols-3">
          <Queue
            count={counts.productsSubmitted}
            label={copy.dash.shopQueueLabel}
            href={routes.adminShop()}
            link={copy.dash.shopQueueLink}
          />
          <Queue
            count={counts.productsTotal}
            label={copy.dash.shopCatalogueLabel.replace(
              '{published}',
              String(counts.productsPublished),
            )}
            href={routes.adminShop()}
            link={copy.dash.shopLink}
          />
          <Queue
            count={counts.vendorsActive + counts.vendorsPending + counts.vendorsSuspended}
            label={copy.dash.shopVendorsLabel
              .replace('{active}', String(counts.vendorsActive))
              .replace('{pending}', String(counts.vendorsPending))
              .replace('{suspended}', String(counts.vendorsSuspended))}
            href={routes.adminShopVendors()}
            link={copy.dash.shopVendorsLink}
          />
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.dash.queuesTitle}</h2>
        <ul className="border-rule grid gap-x-8 gap-y-5 border-t border-b py-4 sm:grid-cols-2">
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

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.dash.stateTitle}</h2>
        <ul className="border-rule grid gap-x-8 gap-y-5 border-t border-b py-4 sm:grid-cols-2">
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
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-display-sm">{copy.dash.flagsTitle}</h2>
        <p className="lede">{copy.dash.flagsLede}</p>
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
  /* The whole figure is the link: a number one cannot click next to a link
     one can is two targets for one destination. */
  return (
    <li>
      <Link href={href} className="group flex flex-col gap-0.5">
        <span className="text-2xl leading-tight font-medium tabular-nums">{count}</span>
        <span className="text-ink-muted text-sm leading-snug">{label}</span>
        {note ? <span className="text-ink-faint text-xs leading-snug">{note}</span> : null}
        <span className="text-accent group-hover:text-accent-bright mt-1 text-xs underline underline-offset-4">
          {link}
        </span>
      </Link>
    </li>
  )
}
