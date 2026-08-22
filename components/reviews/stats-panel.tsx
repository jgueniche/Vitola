import { EmptyState } from '@/components/layout/empty-state'
import { ScoreMark } from '@/components/reviews/entry-parts'
import { formatEffectiveDate } from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import type { ScoreScale } from '@/lib/reviews/model'
import type { CigarStats } from '@/lib/reviews/queries'

const copy = m.cigarStats

/**
 * The public rating of a cigar, straight out of `public.cigar_stats`.
 *
 * Every number here is read from the view and none is recomputed. That is ADR
 * 0004's D3 in the interface: the view's `where visibility = 'public'` is the
 * security boundary — a materialized view cannot carry RLS, so that predicate
 * *is* the protection — and an average recomputed in TypeScript beside it would
 * be a second, unpoliced copy of it. It would also be wrong in a way nobody
 * would notice: the reader's own private entry is visible to the reader, so a
 * mean computed from what the page can see would move for one person and not
 * for the next.
 *
 * The bayesian score leads and the arithmetic mean follows, which is the order
 * §5.4 asks for: "moyenne bayésienne (pas arithmétique) pour éviter qu'un cigare
 * noté une fois à 98 ne domine les classements". Both are shown because a member
 * comparing them learns what the weighting did, and a weighted number that hides
 * its input reads as a number someone made up.
 */
export function StatsPanel({
  stats,
  scale = 100,
}: {
  stats: CigarStats | null
  scale?: ScoreScale
}) {
  /*
   * The view is grouped by cigar, so a cigar nobody has publicly scored has no
   * row rather than a row of zeroes. That is today's state for all 940 entries,
   * which makes this the branch a visitor actually meets — an invitation, per
   * §4.6, and never a dash where a number was expected.
   */
  if (!stats || stats.review_count === 0) {
    return (
      <section aria-labelledby="notes" className="flex flex-col gap-4">
        <h2 id="notes" className="font-display text-2xl">
          {copy.title}
        </h2>
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      </section>
    )
  }

  const bars = [
    { key: 'b90_100', label: '90–100' },
    { key: 'b80_89', label: '80–89' },
    { key: 'b70_79', label: '70–79' },
    { key: 'b60_69', label: '60–69' },
    { key: 'lt60', label: '< 60' },
  ] as const

  const peak = Math.max(1, ...bars.map((bar) => stats.distribution[bar.key] ?? 0))

  return (
    <section aria-labelledby="notes" className="flex flex-col gap-5">
      <h2 id="notes" className="font-display text-2xl">
        {copy.title}
      </h2>

      <div className="border-rule bg-surface flex flex-col gap-5 rounded-[3px] border p-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">{copy.bayesian}</span>
            <ScoreMark score={stats.bayesian_score} scale={scale} size="lg" />
          </div>

          <div className="flex flex-col gap-1">
            <span className="eyebrow">{copy.mean}</span>
            <ScoreMark score={stats.mean_score} scale={scale} size="md" />
          </div>

          <div className="flex flex-col gap-1">
            <span className="eyebrow">{copy.recent}</span>
            {stats.review_count_90d > 0 ? (
              <ScoreMark score={stats.mean_score_90d} scale={scale} size="md" />
            ) : (
              <span className="text-ink-faint text-sm">{copy.recentNone}</span>
            )}
          </div>
        </div>

        <p className="text-ink-muted measure text-xs leading-relaxed">{copy.bayesianHint}</p>

        <div className="flex flex-col gap-2">
          <span className="eyebrow">{copy.distribution}</span>
          <ul className="flex flex-col gap-1">
            {bars.map((bar) => {
              const value = stats.distribution[bar.key] ?? 0
              return (
                <li key={bar.key} className="flex items-center gap-3">
                  <span className="text-ink-faint w-16 shrink-0 font-mono text-xs tabular-nums">
                    {bar.label}
                  </span>
                  {/* A bar, not a chart: one dimension, no axis, no library. */}
                  <span className="bg-surface-raised h-2 flex-1 rounded-[3px]">
                    <span
                      className="bg-accent block h-2 rounded-[3px]"
                      style={{ width: `${(value / peak) * 100}%` }}
                    />
                  </span>
                  <span className="text-ink-muted w-8 shrink-0 text-right font-mono text-xs tabular-nums">
                    {formatCount(value)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-rule text-ink-faint flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs">
          <span>{copy.count.replace('{count}', formatCount(stats.review_count))}</span>
          {stats.review_count_90d > 0 ? (
            <span>
              {copy.recent} — {copy.recentCount.replace('{count}', formatCount(stats.review_count_90d))}
            </span>
          ) : null}
          {stats.last_review_at ? (
            <span>{copy.lastReview.replace('{date}', formatEffectiveDate(stats.last_review_at))}</span>
          ) : null}
          <span>{copy.onlyPublic}</span>
        </div>
      </div>
    </section>
  )
}
