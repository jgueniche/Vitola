import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cigar'
import { formatCount, formatScore } from '@/lib/format'
import { m } from '@/lib/i18n'
import { myScoreScale } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { collectStats, meanScore, monthlyBuckets, rankCigars } from '@/lib/stats/queries'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: m.statistics.title }

const copy = m.statistics

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

/**
 * Mes statistiques — F11, which §9 places at the end of P2.
 *
 * Everything here counts the member's *own* rows, and the two sources are read
 * because they answer different questions: the notebook knows what was thought,
 * the ledger knows what was smoked. ADR 0006 D2 lets one smoke from the cave
 * without noting anything, so "cigares fumés" is legitimately larger than
 * "entrées" and the page says which is which rather than reconciling them into
 * one number that would be neither.
 *
 * Scope is not counted or filtered anywhere. These are one's own entries, all
 * four scopes together — a private note is still something one smoked. What the
 * *rest of the site* sees of them is a different question, answered by four
 * policies, and `scopeNote` says so rather than leaving the reader to wonder
 * why the public average disagrees.
 */
export default async function StatisticsPage() {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.statistics())}`)
  }

  const [stats, scale] = await Promise.all([collectStats(user.id), myScoreScale(user.id)])

  const tastings = stats.entries.filter((entry) => entry.kind === 'tasting').length
  const logs = stats.entries.length - tastings
  const mean = meanScore(stats.entries.map((entry) => entry.score_total))
  const smoked = stats.smokes.reduce((sum, row) => sum + row.qty, 0)

  const buckets = monthlyBuckets(
    stats.entries.map((entry) => entry.smoked_on),
    new Date(),
  )
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const active = buckets.filter((bucket) => bucket.count > 0).length
  const perMonth = active > 0 ? buckets.reduce((sum, b) => sum + b.count, 0) / 12 : 0

  const ranked = rankCigars(stats.entries.map((entry) => entry.cigar_id))

  const nothingYet = stats.entries.length === 0 && smoked === 0 && stats.stockQty === 0

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {nothingYet ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Link href={routes.cigars()}>
              <Button>{copy.emptyAction}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <section className="border-rule bg-surface grid gap-px overflow-hidden rounded-[3px] border sm:grid-cols-3">
            <Figure value={formatCount(stats.entries.length)} label={copy.entriesCount} />
            <Figure value={formatCount(smoked)} label={copy.smokedCount} />
            <Figure
              value={mean === null ? '—' : formatScore(mean, scale)}
              label={copy.meanScore}
              muted={mean === null}
            />
          </section>

          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.smokedHint}</p>

          {stats.truncated ? <p className="text-ink-faint text-xs">{copy.truncated}</p> : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.entriesTitle}</h2>
            <dl className="text-ink-muted flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <Pair label={copy.tastingsCount} value={formatCount(tastings)} />
              <Pair label={copy.logsCount} value={formatCount(logs)} />
            </dl>
            <p className="text-ink-muted text-sm">
              {mean === null ? copy.noScore : copy.meanScoreHint}
            </p>
            <p className="text-ink-faint measure text-xs leading-relaxed">{copy.scopeNote}</p>
          </section>

          <Band variant="divider" />

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-display-sm">{copy.rhythmTitle}</h2>
              <p className="text-ink-muted text-sm">{copy.rhythmLede}</p>
            </div>

            {active === 0 ? (
              <p className="text-ink-muted measure text-sm leading-relaxed">{copy.rhythmEmpty}</p>
            ) : (
              <>
                {/*
                  Bars drawn with a border and a height, not a chart library.
                  Twelve values do not need one (§3), and a <table> underneath
                  would be the honest fallback for a reader who cannot see them
                  — which is why every bar carries its figure as text.
                */}
                <ul className="flex items-end gap-1.5">
                  {buckets.map((bucket) => {
                    const [year, month] = bucket.month.split('-')
                    const label = `${MONTHS[Number(month) - 1] ?? month} ${year?.slice(2) ?? ''}`
                    return (
                      <li key={bucket.month} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-ink-faint text-xs">{bucket.count || ''}</span>
                        <span
                          className={cn(
                            'w-full rounded-[2px]',
                            bucket.count > 0 ? 'bg-accent' : 'bg-surface-raised',
                          )}
                          style={{ height: `${Math.max(2, (bucket.count / peak) * 80)}px` }}
                          aria-hidden="true"
                        />
                        <span className="text-ink-faint text-[10px] whitespace-nowrap">
                          {label}
                        </span>
                        <span className="sr-only">{`${label} : ${bucket.count}`}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-ink-muted text-sm">
                  {copy.perMonth.replace('{count}', (Math.round(perMonth * 10) / 10).toString())}
                </p>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-display-sm">{copy.topTitle}</h2>
              <p className="text-ink-muted text-sm">{copy.topLede}</p>
            </div>

            {ranked.length === 0 ? (
              <p className="text-ink-muted measure text-sm leading-relaxed">{copy.topEmpty}</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {ranked.map((row) => (
                  <li
                    key={row.cigarId}
                    className="border-rule flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"
                  >
                    <span>{stats.cigarNames.get(row.cigarId) ?? '—'}</span>
                    <span className="text-ink-muted">
                      {row.count === 1
                        ? copy.timesOne
                        : copy.timesMany.replace('{count}', String(row.count))}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.stockTitle}</h2>
            <p className="text-ink-muted text-sm">
              {formatCount(stats.stockQty)} {copy.stockCount}
              {stats.stockValue !== null
                ? ` — ${copy.stockValue.replace('{value}', formatPrice(stats.stockValue))}`
                : ''}
            </p>
            {stats.stockValue === null && stats.stockQty > 0 ? (
              <p className="text-ink-faint text-xs">{copy.stockValueUnknown}</p>
            ) : null}
            <div>
              <Link href={routes.humidor()}>
                <Button variant="secondary" size="sm">
                  {m.humidor.title}
                </Button>
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function Figure({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="bg-surface flex flex-col gap-1 px-4 py-4">
      <span className={cn('font-display text-display-sm', muted && 'text-ink-muted')}>{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </span>
  )
}
