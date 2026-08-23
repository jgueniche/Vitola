import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { PostCard } from '@/components/social/post-card'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { decodeCursor, FEED_PAGE_SIZE, type FeedScope } from '@/lib/social/model'
import { readFeedPage } from '@/lib/social/queries'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { Composer } from './composer'

export const metadata: Metadata = { title: m.feed.title }

const copy = m.feed

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The tab, in French in the URL and in English in the code (§0.10).
 *
 * `onglet=decouverte` rather than `scope=discover`: the address bar is content,
 * and `lib/routes.ts` exists so that no French string is written twice. The
 * mapping is here because it is the only place that needs it.
 */
const TAB_PARAM = 'onglet'
const TABS = { abonnements: 'following', decouverte: 'discover' } as const satisfies Record<
  string,
  FeedScope
>
type TabKey = keyof typeof TABS

function readTab(raw: string | undefined): TabKey {
  return raw === 'decouverte' ? 'decouverte' : 'abonnements'
}

/**
 * Le fil — two tabs over one keyset-paginated list.
 *
 * Everything about this page is the exit criterion of P3 made visible.
 *
 * **The pagination is a link, not a scroll.** §5.6 forbids infinite scroll
 * without real pagination, and a link is what "real" means here: it survives a
 * refresh, it can be shared, the back button works, and — the reason that
 * matters most — it can be *read*. The address bar shows the cursor, so a page
 * that starts in the wrong place is a bug one can see rather than one one has
 * to instrument.
 *
 * **The cursor is a date and an identifier, never a page number.** Page 3 of a
 * feed means nothing five seconds later: two publications arrive, and page 3
 * now begins with two rows page 2 already showed. The keyset asks "what comes
 * before this exact publication", which is stable whatever arrives above it.
 *
 * **One call per page.** `feed_page()` returns the publication, its author, its
 * cigar, its counts and whether the reader has embered it. Twenty rows cost one
 * round trip, and adding a column to the card cannot turn that into twenty-one.
 *
 * Signed out redirects to the sign-in page, like `/carnet`: the following tab is
 * empty by definition for someone with no account, and a nav entry whose one
 * behaviour is to bounce you is a promise it cannot keep.
 */
export default async function FeedPage({ searchParams }: Search) {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.feed())}`)
  }

  const query = await searchParams
  const tab = readTab(one(query[TAB_PARAM]))
  const scope = TABS[tab]
  const cursor = decodeCursor(one(query.avant))

  const { items, next } = await readFeedPage(scope, cursor, FEED_PAGE_SIZE)

  const tabHref = (key: TabKey) =>
    key === 'abonnements' ? routes.feed() : `${routes.feed()}?${TAB_PARAM}=${key}`

  const nextHref = () => {
    const params = new URLSearchParams()
    if (tab !== 'abonnements') params.set(TAB_PARAM, tab)
    if (next) params.set('avant', next)
    return `${routes.feed()}?${params.toString()}`
  }

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      <nav aria-label={copy.title} className="flex flex-wrap gap-2">
        {(Object.keys(TABS) as TabKey[]).map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              'rounded-[3px] border px-3 py-1 text-sm transition-colors duration-(--duration-quick)',
              tab === key
                ? 'border-accent text-accent'
                : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
            )}
          >
            {key === 'abonnements' ? copy.tabs.following : copy.tabs.discover}
          </Link>
        ))}
      </nav>

      <p className="text-ink-muted measure text-sm">
        {tab === 'abonnements' ? copy.followingLede : copy.discoverLede}
      </p>

      {/* The composer sits above the list and only on the first page: it is a
          gesture, and a gesture repeated at the bottom of page seven is a
          gesture nobody was looking for. */}
      {cursor === null ? <Composer /> : null}

      <section aria-label={copy.title} className="flex flex-col gap-3">
        {items.length === 0 ? (
          cursor !== null ? (
            <EmptyState
              title={copy.emptyPageTitle}
              description={copy.emptyPageBody}
              action={
                <Link href={tabHref(tab)}>
                  <Button variant="secondary" size="sm">
                    {copy.backToStart}
                  </Button>
                </Link>
              }
            />
          ) : tab === 'abonnements' ? (
            <EmptyState
              title={copy.emptyFollowingTitle}
              description={copy.emptyFollowingBody}
              action={
                <Link href={tabHref('decouverte')}>
                  <Button size="sm">{copy.emptyFollowingAction}</Button>
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={copy.emptyDiscoverTitle}
              description={copy.emptyDiscoverBody}
              action={
                <Link href={routes.cigars()}>
                  <Button size="sm">{copy.emptyDiscoverAction}</Button>
                </Link>
              }
            />
          )
        ) : (
          items.map((post) => (
            <PostCard key={post.id} post={post} isMine={post.author_id === user.id} />
          ))
        )}
      </section>

      {next ? (
        <div className="flex flex-col items-center gap-3">
          <Link href={nextHref()}>
            <Button variant="secondary">{copy.older}</Button>
          </Link>
          <p className="text-ink-faint measure text-center text-xs leading-relaxed">
            {copy.cursorNote}
          </p>
        </div>
      ) : null}

      {cursor !== null ? (
        <p className="text-center text-sm">
          <Link href={tabHref(tab)} className="text-accent hover:underline">
            {copy.backToStart}
          </Link>
        </p>
      ) : null}
    </main>
  )
}
