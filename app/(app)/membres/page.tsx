import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient, currentUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: m.members.title }

const copy = m.members

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * L'annuaire — who agreed to appear.
 *
 * There is no `is_discoverable` filter in the query, and that is not an
 * oversight: `profiles_select_directory` is `is_discoverable or id = auth.uid()
 * or has_min_role('moderator')`, so the list is already exactly the people who
 * said yes, plus oneself. Restating the predicate here would double a policy —
 * the rule ADR 0004 set for the notebook, which holds for every table with RLS
 * and not only for the ones carrying a visibility column.
 *
 * The block does not need a filter either: `profiles_block_restrictive` is
 * AND-ed with the directory policy, so somebody one has blocked simply is not
 * in the list. A `not in (…)` here would be the block applied in TypeScript,
 * which is the thing ADR 0007's D4 exists to refuse.
 *
 * The search is a `<form method="get">`, so this page ships no JavaScript — the
 * rule the faceted search of P1 established and the humidor kept.
 */
export default async function MembersPage({ searchParams }: Search) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.members())}`)
  }

  const query = await searchParams
  const raw = Array.isArray(query.q) ? (query.q[0] ?? '') : (query.q ?? '')
  const term = raw.trim()

  const supabase = await createSupabaseServerClient()
  let request = supabase
    .from('profiles')
    .select('id, handle, display_name, bio, country')
    .order('created_at', { ascending: false })
    .limit(100)

  if (term.length >= 2) {
    /* `ilike` on the handle only. Searching the display name too would let one
       find, by trying names, somebody who chose a handle precisely so as not to
       be found by their own. */
    request = request.ilike('handle', `%${term.replaceAll('%', '')}%`)
  }

  const { data, error } = await request
  if (error) throw new Error(`Could not read the directory: ${error.message}`)

  const members = data ?? []
  const count =
    members.length === 1 ? copy.countOne : copy.countMany.replace('{count}', String(members.length))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <label htmlFor="q" className="eyebrow">
            {copy.search}
          </label>
          <Input id="q" name="q" type="search" defaultValue={raw} />
        </div>
        <Button type="submit" variant="secondary">
          {copy.searchAction}
        </Button>
      </form>

      {members.length === 0 ? (
        term.length >= 2 ? (
          <EmptyState
            title={copy.searchEmptyTitle}
            description={copy.searchEmptyBody}
            action={
              <Link href={routes.members()}>
                <Button variant="secondary" size="sm">
                  {copy.searchReset}
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        )
      ) : (
        <>
          <p className="text-ink-faint text-sm">{count}</p>
          <ul className="flex flex-col gap-3">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  href={routes.member(member.handle)}
                  className="border-rule bg-surface hover:border-rule-strong flex flex-col gap-1 rounded-[3px] border p-4 transition-colors duration-(--duration-quick)"
                >
                  <span className="text-ink text-sm">
                    {member.display_name ?? `@${member.handle}`}
                    {member.id === user.id ? (
                      <span className="text-ink-faint"> · {copy.you}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-faint font-mono text-xs">@{member.handle}</span>
                  {member.bio ? (
                    <span className="text-ink-muted measure line-clamp-2 text-sm leading-relaxed">
                      {member.bio}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
