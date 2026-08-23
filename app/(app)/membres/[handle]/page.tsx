import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { EntryCard } from '@/components/reviews/entry-card'
import { PostCard } from '@/components/social/post-card'
import { Button } from '@/components/ui/button'
import { countryLabel } from '@/lib/cigar'
import { formatDate } from '@/lib/format'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'
import { listMyNotebook, myScoreScale } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import {
  countFollows,
  getProfileByHandle,
  listFollowGraph,
  readFollowState,
  readProfilePrivacy,
  readSharedShelf,
} from '@/lib/social/queries'
import { relationConfirmation } from '@/lib/social/confirmations'
import { createSupabaseServerClient, currentUser } from '@/lib/supabase/server'

import { RelationForms } from './relation-forms'

const copy = m.members

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  return { title: copy.profileTitle.replace('{handle}', `@${handle}`) }
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <Band variant="divider" />
      <h2 className="font-display text-2xl">{title}</h2>
      {children}
    </section>
  )
}

function PersonList({ people, empty }: { people: { id: string; handle: string; display_name: string | null }[]; empty: string }) {
  if (people.length === 0) return <p className="text-ink-faint text-sm">{empty}</p>

  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            href={routes.member(person.handle)}
            className="border-rule text-ink-muted hover:border-rule-strong hover:text-ink inline-flex rounded-[3px] border px-2.5 py-1 text-sm"
          >
            {person.display_name ?? `@${person.handle}`}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * A member's public profile — the screen the third privacy debt was waiting for.
 *
 * Three keys decide what it shows, and they are not the same kind of promise.
 * Migration 0011 spells the distinction out; here is what it looks like:
 *
 *   - **`show_humidor`** is a right. The shelf comes from
 *     `shared_humidor_shelf()`, which re-checks the key and the block itself,
 *     and a direct read of `humidor_items` returns nothing whatever this page
 *     does — a RESTRICTIVE policy sees to that. The price never crosses,
 *     because the function does not return it.
 *   - **`show_reviews`** is a display. A `public` entry stays public: it is on
 *     the cigar page and in its average whatever this says. What the key
 *     decides is whether the profile lists them, and the page says so rather
 *     than implying a lock.
 *   - **`show_country`** is a display too, and the weakest of the three:
 *     `profiles` is a public directory.
 *
 * A 404 covers "no such handle", "not discoverable" and "has blocked you"
 * without distinguishing them. Three situations, one answer, because
 * distinguishing them is telling one person something about another — and the
 * middle one is somebody's explicit choice, honoured rather than worked around
 * (the rule `lib/reviews/queries.ts` set for a hidden author).
 */
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { handle } = await params
  const confirmation = relationConfirmation((await searchParams).fait)

  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.member(handle))}`)
  }

  const profile = await getProfileByHandle(handle)
  if (!profile) notFound()

  const isMe = profile.id === user.id

  const [privacy, counts, followers, following, relation, slaHours] = await Promise.all([
    readProfilePrivacy(profile.id),
    countFollows(profile.id),
    listFollowGraph(profile.id, 'followers', 30),
    listFollowGraph(profile.id, 'following', 30),
    isMe
      ? Promise.resolve({ iFollow: false, followsMe: false, blocked: false })
      : readFollowState(user.id, profile.id),
    reportSlaHours(),
  ])

  /* Their publications, through the same keyset the feed uses. `feed_page` has
     no author argument — adding one would be a second shape of the same query —
     so this reads `posts` directly and hydrates nothing it does not need. The
     RLS is identical either way: a `followers` publication appears here only to
     somebody who follows them. */
  const supabase = await createSupabaseServerClient()
  const { data: postRows } = await supabase
    .from('posts')
    .select(
      'id, author_id, kind, visibility, body, cigar_id, review_id, ember_count, comment_count, created_at, updated_at',
    )
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10)

  const [entries, scale, shelf] = await Promise.all([
    privacy.show_reviews ? listMyNotebook(profile.id, { visibility: 'public' }) : Promise.resolve([]),
    myScoreScale(user.id),
    privacy.show_humidor ? readSharedShelf(profile.id) : Promise.resolve([]),
  ])

  /* Two follow-up queries for the whole page, never one per card. The feed gets
     both for free inside `feed_page()`; here the list is short and bounded, so
     a pair of `in (…)` is a fixed cost and not an N+1.
     
     Neither is optional. Rendering `viewer_embered: false` would have shown an
     un-embered button over a publication the reader had embered; leaving the
     cigar null would have rendered a "je fume" publication with nothing to say
     what is being smoked — a card that is about a cigar, without the cigar. */
  const ids = (postRows ?? []).map((row) => row.id)
  const cigarIds = [
    ...new Set((postRows ?? []).map((row) => row.cigar_id).filter((id): id is string => !!id)),
  ]

  const [mine, cigars] = await Promise.all([
    ids.length
      ? supabase.from('post_reactions').select('post_id').in('post_id', ids).eq('user_id', user.id)
      : Promise.resolve({ data: [] as { post_id: string }[] }),
    cigarIds.length
      ? supabase.schema('ref').from('cigars').select('id, slug, commercial_name, brands(name)').in('id', cigarIds)
      : Promise.resolve({ data: [] }),
  ])

  const embered = new Set((mine.data ?? []).map((row) => row.post_id))
  const cigarById = new Map(
    ((cigars.data ?? []) as unknown as {
      id: string
      slug: string
      commercial_name: string
      brands: { name: string } | null
    }[]).map((cigar) => [cigar.id, cigar]),
  )

  const posts = (postRows ?? []).map((row) => {
    const cigar = row.cigar_id ? cigarById.get(row.cigar_id) : undefined
    return {
      ...row,
      viewer_embered: embered.has(row.id),
      author_handle: profile.handle,
      author_display_name: profile.display_name,
      cigar_slug: cigar?.slug ?? null,
      cigar_name: cigar?.commercial_name ?? null,
      brand_name: cigar?.brands?.name ?? null,
    }
  })

  const followersLabel =
    counts.followers === 1
      ? copy.followersCountOne
      : copy.followersCountMany.replace('{count}', String(counts.followers))

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">
          {profile.display_name ?? `@${profile.handle}`}
        </h1>
        <p className="text-ink-faint font-mono text-sm">@{profile.handle}</p>
        {profile.bio ? (
          <p className="text-ink-muted measure pt-2 text-sm leading-relaxed">{profile.bio}</p>
        ) : null}
      </div>

      <dl className="text-ink-muted flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.joined}</dt>
          <dd>{formatDate(new Date(profile.created_at))}</dd>
        </div>
        {privacy.show_country && profile.country ? (
          <div className="flex gap-2">
            <dt className="eyebrow text-ink-faint">{copy.country}</dt>
            <dd>
              {countryLabel(profile.country)}
              {profile.city ? ` · ${profile.city}` : ''}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.reputation}</dt>
          <dd>{profile.reputation}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.followersTitle}</dt>
          <dd>{followersLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="eyebrow text-ink-faint">{copy.followingTitle}</dt>
          <dd>{copy.followingCount.replace('{count}', String(counts.following))}</dd>
        </div>
      </dl>

      {confirmation ? (
        <p role="status" className="text-ink-muted text-sm">
          {confirmation}
        </p>
      ) : null}

      <div className="border-rule bg-surface rounded-[3px] border p-5">
        {isMe ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-ink-muted text-sm">{copy.you}</p>
            <Link href={routes.settings()}>
              <Button variant="secondary" size="sm">
                {copy.editProfile}
              </Button>
            </Link>
          </div>
        ) : (
          <RelationForms
            userId={profile.id}
            handle={profile.handle}
            state={relation}
            retour={routes.member(profile.handle)}
          />
        )}
      </div>

      <Section title={copy.postsTitle}>
        {posts.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.postsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} isMine={isMe} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={copy.reviewsTitle}>
        {!privacy.show_reviews ? (
          <p className="text-ink-faint measure text-sm leading-relaxed">{copy.reviewsHidden}</p>
        ) : entries.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.reviewsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard entry={entry} scale={scale} showCigar />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={copy.humidorTitle}>
        {!privacy.show_humidor ? (
          <p className="text-ink-faint measure text-sm leading-relaxed">{copy.humidorHidden}</p>
        ) : shelf.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.humidorEmpty}</p>
        ) : (
          <>
            <p className="text-ink-muted measure text-sm leading-relaxed">{copy.humidorNote}</p>
            <ul className="flex flex-col gap-2">
              {shelf.map((lot) => (
                <li
                  key={`${lot.humidor_id}-${lot.cigar_id}-${lot.aging_start_date ?? 'x'}`}
                  className="border-rule bg-surface flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-[3px] border p-3 text-sm"
                >
                  <span>
                    {lot.slug ? (
                      <Link href={routes.cigar(lot.slug)} className="text-accent hover:underline">
                        {lot.brand ? `${lot.brand} ` : ''}
                        {lot.name}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">{m.notebook.entry.unknownCigar}</span>
                    )}
                    <span className="text-ink-faint"> · {lot.humidor_name}</span>
                  </span>
                  <span className="text-ink-muted">
                    {copy.humidorQty.replace('{count}', String(lot.qty))}
                    {lot.aging_start_date
                      ? ` · ${copy.agingSince.replace('{date}', formatDate(new Date(lot.aging_start_date)))}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={copy.followersTitle}>
        <PersonList people={followers} empty={copy.followersEmpty} />
      </Section>

      <Section title={copy.followingTitle}>
        <PersonList people={following} empty={copy.followingEmpty} />
      </Section>

      {!isMe ? (
        <div className="border-rule border-t pt-6">
          <ReportDialog
            kind="profile"
            id={profile.id}
            slaHours={slaHours}
            label={m.moderation.report.triggerProfile}
          />
        </div>
      ) : null}
    </main>
  )
}
