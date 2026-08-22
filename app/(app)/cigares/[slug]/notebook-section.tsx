import Link from 'next/link'

import { Band } from '@/components/band/band'
import { EntryCard } from '@/components/reviews/entry-card'
import { StatsPanel } from '@/components/reviews/stats-panel'
import { todayInBrandZone } from '@/lib/format'
import { m } from '@/lib/i18n'
import { getCigarStats, listReviewsForCigar, myScoreScale } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { LogForm } from './log-form'

const copy = m.cigarStats

/**
 * The notebook, on the cigar page: what the members scored it, what they wrote,
 * and the box to write in.
 *
 * The order is an argument. The public average first, because it is what a
 * visitor came for; then the entries behind it, so the number can be checked
 * against its sources; then the form, which reads as joining something rather
 * than as being asked for an opinion. Same reasoning as the comment thread
 * below it, and deliberately the same shape.
 *
 * `listReviewsForCigar` filters nothing. Four SELECT policies decide what comes
 * back, so this one call returns public entries to an anonymous visitor and
 * additionally the reader's own — private ones included — to a signed-in
 * member. A member therefore finds their private note in place on the cigar
 * page, which is where they wrote it and where they will look for it.
 *
 * That has a consequence worth naming: what this list shows and what the
 * average counts are deliberately *not* the same set. The average reads only
 * public entries, from a view whose predicate is its security boundary. Someone
 * seeing their own private entry above a mean that ignores it is not looking at
 * a bug — `publicCounts` in the scope selector is where they were told.
 */
export async function NotebookSection({ cigarId, slug }: { cigarId: string; slug: string }) {
  const user = await currentUser()

  const [stats, entries, scale] = await Promise.all([
    getCigarStats(cigarId),
    listReviewsForCigar(cigarId),
    user ? myScoreScale(user.id) : Promise.resolve(100 as const),
  ])

  return (
    <section className="flex flex-col gap-8">
      <Band variant="divider" />

      <StatsPanel stats={stats} scale={scale} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.entriesTitle}</h2>
          <p className="text-ink-muted text-sm">{copy.entriesLede}</p>
        </div>

        {entries.length === 0 ? (
          <p className="text-ink-faint text-sm">{copy.entriesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryCard
                  entry={entry}
                  scale={scale}
                  showAuthor
                  isMine={user?.id === entry.user_id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {user ? (
        <div className="border-rule bg-surface rounded-[3px] border p-5">
          <LogForm cigarId={cigarId} slug={slug} today={todayInBrandZone()} />
        </div>
      ) : (
        <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border p-6">
          <p className="eyebrow">{m.notebook.form.signInTitle}</p>
          <p className="text-ink-muted measure text-sm leading-relaxed">
            {m.notebook.form.signInBody}
          </p>
          <Link
            href={`${routes.signIn()}?suite=${encodeURIComponent(routes.cigar(slug))}`}
            className="text-accent-bright mt-1 w-fit text-sm underline underline-offset-4"
          >
            {m.notebook.form.signInAction}
          </Link>
        </div>
      )}
    </section>
  )
}
