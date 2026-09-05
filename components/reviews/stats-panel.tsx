import { ScoreMark } from '@/components/reviews/entry-parts'
import { formatEffectiveDate } from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import type { ScoreScale } from '@/lib/reviews/model'
import { aromaLabels, type CigarStats } from '@/lib/reviews/queries'

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
 * The card is sized to its content (design system of 5 septembre 2026): the
 * weighted mean at 48px on the left, its sources on the right, the
 * distribution as five 160px bars rather than five full-width ones for counts
 * of zero. Empty, it is one line — not a 150px box in the middle of the page,
 * which was the state of 937 sheets out of 940.
 *
 * The most-cited aromas come from the same view and the same boundary
 * (migration 0025): a public entry that names cèdre is one citation, and a
 * private one is none, whoever is reading. They are the members' half of the
 * question the owner asked — "y a-t-il bien les arômes ?" — the referential's
 * half is the sheet's own profile, rendered by the page above this card.
 */
export async function StatsPanel({
  stats,
  scale = 100,
}: {
  stats: CigarStats | null
  scale?: ScoreScale
}) {
  const cited = stats?.top_aromas ?? []
  const labels = await aromaLabels(cited.map((aroma) => aroma.id))

  /*
   * The view is grouped by cigar, so a cigar nobody has publicly written about
   * has no row rather than a row of zeroes; one with public words but no public
   * score has a row whose review_count is 0. Both are the same invitation, per
   * §4.6 — and the cited aromas still render below it when they exist.
   */
  const empty = !stats || stats.review_count === 0

  return (
    <section aria-labelledby="notes" className="flex flex-col gap-3">
      <h2 id="notes" className="font-display text-display-sm">
        {copy.title}
      </h2>

      {empty ? (
        <div className="border-rule bg-surface flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border px-5 py-4">
          <p className="text-ink-muted text-sm">{copy.emptyLine}</p>
        </div>
      ) : (
        <div className="border-rule bg-surface grid rounded-[3px] border sm:grid-cols-[12.5rem_minmax(0,1fr)]">
          <div className="border-rule flex flex-col justify-center gap-1 border-b p-5 sm:border-r sm:border-b-0">
            <span className="eyebrow">{copy.bayesian}</span>
            <ScoreMark score={stats.bayesian_score} scale={scale} size="lg" />
            <span className="text-ink-muted text-xs">
              {stats.review_count === 1
                ? copy.publicOne
                : copy.publicMany.replace('{count}', formatCount(stats.review_count))}
            </span>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow">{copy.mean}</dt>
                <dd className="text-base font-medium tabular-nums">
                  <ScoreMark score={stats.mean_score} scale={scale} size="sm" />
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow">{copy.recent}</dt>
                <dd className="text-base font-medium tabular-nums">
                  {stats.review_count_90d > 0 ? (
                    <>
                      <ScoreMark score={stats.mean_score_90d} scale={scale} size="sm" />
                      <span className="text-ink-muted text-xs font-normal">
                        {' · '}
                        {copy.recentCount.replace('{count}', formatCount(stats.review_count_90d))}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint text-sm font-normal">{copy.recentNone}</span>
                  )}
                </dd>
              </div>
              {stats.last_review_at ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="eyebrow">{copy.lastReviewLabel}</dt>
                  <dd className="text-base font-medium">
                    {formatEffectiveDate(stats.last_review_at)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <Distribution distribution={stats.distribution} />
          </div>
        </div>
      )}

      {cited.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="eyebrow">{copy.citedAromas}</span>
          <ul className="flex flex-wrap gap-2">
            {cited.map((aroma) => {
              const label = labels.get(aroma.id)
              if (!label) return null
              return (
                <li
                  key={aroma.id}
                  className="border-rule-strong text-ink inline-flex items-baseline gap-1.5 rounded-[3px] border px-2 py-1 text-xs"
                >
                  {label}
                  <span className="text-ink-faint font-mono tabular-nums">
                    {formatCount(aroma.n)}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-ink-faint text-xs leading-relaxed">{copy.citedAromasHint}</p>
        </div>
      ) : null}

      {empty ? null : <p className="text-ink-faint measure text-xs leading-relaxed">{copy.hint}</p>}
    </section>
  )
}

const BARS = [
  { key: 'b90_100', label: '90–100' },
  { key: 'b80_89', label: '80–89' },
  { key: 'b70_79', label: '70–79' },
  { key: 'b60_69', label: '60–69' },
  { key: 'lt60', label: '< 60' },
] as const

/** Five bars, 160px wide: one dimension, no axis, no library, no full-width zero. */
function Distribution({ distribution }: { distribution: Record<string, number> }) {
  const peak = Math.max(1, ...BARS.map((bar) => distribution[bar.key] ?? 0))
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{copy.distribution}</span>
      <ul className="grid grid-cols-[3rem_10rem_1.5rem] items-center gap-x-3 gap-y-1">
        {BARS.map((bar) => {
          const value = distribution[bar.key] ?? 0
          return (
            <li key={bar.key} className="contents">
              <span className="text-ink-faint font-mono text-xs tabular-nums">{bar.label}</span>
              <span className="bg-surface-raised h-1.5 rounded-[3px]">
                <span
                  className="bg-accent block h-1.5 rounded-[3px]"
                  style={{ width: `${(value / peak) * 100}%` }}
                />
              </span>
              <span className="text-ink-muted text-right font-mono text-xs tabular-nums">
                {formatCount(value)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
