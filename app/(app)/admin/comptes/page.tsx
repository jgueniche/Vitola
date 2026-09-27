import type { Metadata } from 'next'
import { Unavailable } from '@/components/layout/unavailable'
import { accessory } from '@/lib/degrade'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { SectionHead } from '@/components/layout/section-head'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { listAccounts, listInvitations, type AccountRow } from '@/lib/admin/queries'
import { countryLabel, formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { roleLabel } from '@/lib/settings/roles'

import { AdminRestricted, adminView } from '../shell'

export const metadata: Metadata = { title: m.admin.accounts.title }

const copy = m.admin.accounts

/**
 * The accounts — a directory, not a power.
 *
 * Each row says who the account is: the name they show, their e-mail, and a
 * phone or a city when they gave one. It used to be titled by the handle, and
 * four accounts in nine carry the one made up at sign-up — `membre_` and twelve
 * hex digits — which is the database's name for a person, not anyone's (asked
 * on 26 September 2026). The e-mail comes from `auth.users` through
 * `admin_accounts()` (migration 0037), a door guarded by the admin role inside.
 * A member without a display name is titled by their e-mail and says so.
 *
 * What an admin DOES to an account lives elsewhere on purpose: promotion on the
 * member's profile where the panel already exists, suspension nowhere until it
 * has an arm (ADR 0013, D4), erasure with its owner (RGPD). This page finds
 * people.
 *
 * The search is a `<form method="get">` — shareable, reloadable, zero client
 * JavaScript, like the member directory it mirrors.
 *
 * The invitations at the bottom answer the one question a directory of
 * existing accounts cannot: who has been invited and has not come yet
 * (migration 0033). Read-only here on purpose — writing the list is a
 * migration, because an invitation grants a role and a role grant that can be
 * typed into a form is a role grant with no trace.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminAccountsPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminAccounts())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const q = typeof query.q === 'string' ? query.q : ''
  /* The directory is the subject. The invitations below are a second section
     with its own empty state — « aucune invitation » from a failed read would
     hide an account waiting to be claimed (ADR 0020). */
  const [accounts, invitationsRead] = await Promise.all([
    listAccounts(q),
    accessory(listInvitations()),
  ])

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <SectionHead eyebrow={m.admin.eyebrow} title={copy.title} lede={copy.lede} />

      <form method="get" className="flex max-w-md items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="q">{copy.searchLabel}</Label>
          <Input id="q" name="q" defaultValue={q} placeholder={copy.searchPlaceholder} />
        </div>
        <Button type="submit" variant="secondary">
          {copy.search}
        </Button>
      </form>

      {accounts.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="border-rule flex flex-col border-t">
            {accounts.map((account) => (
              <AccountLine key={account.id} account={account} />
            ))}
          </ul>
          <p className="text-ink-faint text-xs">
            {copy.countNote.replace('{count}', String(accounts.length))}
          </p>
        </div>
      )}

      <section aria-labelledby="invitations" className="flex flex-col gap-3">
        <SectionHead
          id="invitations"
          level="h2"
          size="sm"
          title={copy.invitationsTitle}
          lede={copy.invitationsLede}
        />
        {!invitationsRead.ok ? (
          <Unavailable />
        ) : invitationsRead.value.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.invitationsEmpty}</p>
        ) : (
          <ul className="border-rule flex flex-col border-t">
            {invitationsRead.value.map((invitation) => (
              <li
                key={invitation.email}
                className="border-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-3"
              >
                <span className="text-ink text-sm">{invitation.email}</span>
                <span className="flex flex-wrap items-baseline gap-x-3 text-xs">
                  <span className="text-ink-muted">{roleLabel(invitation.role)}</span>
                  <span className={invitation.claimed_at ? 'text-ink-faint' : 'text-caution'}>
                    {invitation.claimed_at
                      ? copy.invitationsClaimed.replace(
                          '{date}',
                          formatEffectiveDate(invitation.claimed_at.slice(0, 10)),
                        )
                      : copy.invitationsPending}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

/**
 * One account, by who it is.
 *
 * The title is the display name, and the e-mail when there is none — the one
 * thing every account has. The line under it holds what identifies the person
 * beyond that: the e-mail (a `mailto:`, since writing to them is the usual next
 * step), a phone and a city when they exist. Nothing is printed for what is
 * missing except the name, because « nom non renseigné » is itself worth
 * knowing about an account an admin is looking at.
 */
function AccountLine({ account }: { account: AccountRow }) {
  const place = [account.city, account.country ? countryLabel(account.country) : null]
    .filter((part): part is string => Boolean(part))
    .join(', ')

  return (
    <li className="border-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ink font-medium break-words">
          {account.display_name ?? account.email ?? copy.nameMissing}
        </span>
        <span className="text-ink-muted flex flex-wrap items-baseline gap-x-2 text-sm">
          {account.display_name && account.email ? (
            <a href={`mailto:${account.email}`} className="text-accent break-all hover:underline">
              {account.email}
            </a>
          ) : null}
          {!account.display_name ? (
            <span className="text-ink-faint">{copy.nameMissing}</span>
          ) : null}
          {account.phone ? <span>{copy.phone.replace('{phone}', account.phone)}</span> : null}
          {place ? <span>{place}</span> : null}
        </span>
      </span>
      <span className="text-ink-faint flex flex-wrap items-baseline gap-x-3 text-xs">
        <span className="text-ink-muted">{roleLabel(account.role)}</span>
        <span>
          {copy.colCreated} {formatEffectiveDate(account.created_at.slice(0, 10))}
        </span>
        <span>
          {copy.colDiscoverable}{' '}
          {account.is_discoverable ? copy.discoverableYes : copy.discoverableNo}
        </span>
        <span>
          {copy.colReputation} {account.reputation}
        </span>
        <Link href={routes.member(account.handle)} className="text-accent text-sm underline">
          {copy.openProfile}
        </Link>
      </span>
    </li>
  )
}
