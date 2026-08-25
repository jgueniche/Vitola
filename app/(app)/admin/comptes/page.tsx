import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { listAccounts } from '@/lib/admin/queries'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { AdminRestricted, adminView } from '../shell'

export const metadata: Metadata = { title: m.admin.accounts.title }

const copy = m.admin.accounts

/**
 * The accounts — a directory, not a power.
 *
 * Reading every profile (non-discoverable included) is what
 * `profiles_select_directory` already grants a moderator+. What an admin DOES
 * to an account lives elsewhere on purpose: promotion on the member's profile
 * where the panel already exists, suspension nowhere until it has an arm
 * (ADR 0013, D4), erasure with its owner (RGPD). This page finds people.
 *
 * The search is a `<form method="get">` — shareable, reloadable, zero client
 * JavaScript, like the member directory it mirrors.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminAccountsPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminAccounts())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const q = typeof query.q === 'string' ? query.q : ''
  const accounts = await listAccounts(q)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.admin.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

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
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="border-rule bg-surface flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[3px] border px-4 py-3"
              >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold">{account.handle}</span>
                  {account.display_name ? (
                    <span className="text-ink-muted text-sm">{account.display_name}</span>
                  ) : null}
                  <span className="eyebrow">{account.role}</span>
                </span>
                <span className="text-ink-faint flex flex-wrap items-baseline gap-x-3 text-xs">
                  <span>
                    {copy.colReputation} {account.reputation}
                  </span>
                  <span>
                    {copy.colDiscoverable}{' '}
                    {account.is_discoverable ? copy.discoverableYes : copy.discoverableNo}
                  </span>
                  <span>
                    {copy.colCreated} {formatEffectiveDate(account.created_at.slice(0, 10))}
                  </span>
                  <Link
                    href={routes.member(account.handle)}
                    className="text-accent text-sm underline"
                  >
                    {copy.openProfile}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-faint text-xs">
            {copy.countNote.replace('{count}', String(accounts.length))}
          </p>
        </div>
      )}
    </main>
  )
}
