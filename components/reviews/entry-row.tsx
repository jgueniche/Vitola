import Link from 'next/link'

import { KindBadge, ScopeBadge, ScoreMark } from '@/components/reviews/entry-parts'
import { formatEffectiveDate } from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { SCORE_KEYS, SUB_SCORE_MAX, type ScoreKey, type ScoreScale } from '@/lib/reviews/model'
import type { ReviewWithContext } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'

const copy = m.notebook.entry

/**
 * One entry, as it appears in a list — the notebook, a member's shelf, or a
 * cigar page.
 *
 * A row under a hairline, not a card: the design audit of 5 septembre 2026
 * found that an entry, a comment, a form and an empty state all wore the same
 * bordered box, so a two-word note took the frame of a four-thousand-sign
 * tasting. The score now sits in a 72px margin where the eye finds it first,
 * the author and the nature share one 12px line, the text keeps its measure,
 * and a tasting carries its six criteria as 3px bars — the one thing that
 * used to distinguish it was an eyebrow.
 *
 * `formatEffectiveDate` comes from `lib/cigar` and is named for a price, which
 * is not this. It is reused anyway because it is the one place in the codebase
 * that parses `YYYY-MM-DD` field by field instead of handing it to
 * `new Date(string)` — that constructor reads a bare date as UTC midnight and
 * renders it locally, showing the day before west of Greenwich.
 *
 * `showScope` is off on a cigar page for other people's entries and on for
 * one's own everywhere: everything visible on a sheet that is not yours is
 * public by definition, and the one entry whose scope matters there is yours.
 */
export function EntryRow({
  entry,
  scale = 100,
  showCigar = false,
  showAuthor = false,
  showScope = false,
  isMine = false,
}: {
  entry: ReviewWithContext
  scale?: ScoreScale
  showCigar?: boolean
  showAuthor?: boolean
  showScope?: boolean
  isMine?: boolean
}) {
  const authorLabel =
    entry.author?.display_name ?? (entry.author ? `@${entry.author.handle}` : copy.authorHidden)

  const subScores = entry.scores as Partial<Record<ScoreKey, number>>
  const hasSubScores =
    entry.kind === 'tasting' && SCORE_KEYS.some((key) => typeof subScores[key] === 'number')

  return (
    <article className="border-rule grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 border-b py-5">
      <div className="flex flex-col">
        <ScoreMark score={entry.score_total} scale={scale} size="md" />
      </div>

      <div className="flex min-w-0 flex-col gap-2.5">
        {showCigar ? (
          entry.cigar ? (
            <Link
              href={routes.cigar(entry.cigar.slug)}
              className="text-ink hover:text-accent-bright text-base leading-tight font-medium"
            >
              {entry.cigar.brand ? (
                <span className="text-ink-muted font-normal">{entry.cigar.brand} </span>
              ) : null}
              {entry.cigar.commercial_name}
            </Link>
          ) : (
            <span className="text-ink-faint text-base">{copy.unknownCigar}</span>
          )
        ) : null}

        <div className="text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {/* One label, not two. On a cigar page an author would otherwise
              read "Par Test Un" and "Votre entrée" side by side about the
              same row; "Votre entrée" is the one that tells them something. */}
          {isMine ? (
            <span className="text-accent text-sm">{m.cigarStats.mine}</span>
          ) : showAuthor ? (
            <span className="text-ink text-sm">{authorLabel}</span>
          ) : null}
          <KindBadge kind={entry.kind} />
          {isMine || showScope ? <ScopeBadge visibility={entry.visibility} /> : null}
          <span>
            {copy.smokedOn} {formatEffectiveDate(entry.smoked_on)}
          </span>
          {entry.updated_at !== entry.created_at ? <span>{copy.edited}</span> : null}
          {entry.is_blind ? <span>{copy.blind}</span> : null}
          {/* Only the author is offered the entry's own page, because that page
              is where one edits, re-scopes and names people. A public entry is
              readable there by anyone the RLS lets in — but sending a visitor to
              someone else's notebook from a cigar page would be an odd door. */}
          {isMine ? (
            <Link
              href={routes.notebookEntry(entry.id)}
              className="text-ink-muted hover:text-ink underline underline-offset-4"
            >
              {m.notebook.openEntry}
            </Link>
          ) : null}
        </div>

        {entry.body ? (
          <p className="text-ink measure text-sm leading-relaxed whitespace-pre-line">
            {entry.body}
          </p>
        ) : null}

        {hasSubScores ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={copy.subScores}>
            {SCORE_KEYS.map((key) => {
              const value = subScores[key]
              if (typeof value !== 'number') return null
              return (
                <li key={key} className="flex w-[4.5rem] flex-col gap-1">
                  <span className="text-ink-faint text-xs">
                    {m.notebook.scores[key]}
                    <span className="sr-only">
                      {' '}
                      {formatCount(value)}/{SUB_SCORE_MAX}
                    </span>
                  </span>
                  <span
                    className="bg-surface-raised block h-[3px]"
                    title={`${formatCount(value)}/${SUB_SCORE_MAX}`}
                    aria-hidden="true"
                  >
                    <span
                      className="bg-ink-faint block h-[3px]"
                      style={{ width: `${(value / SUB_SCORE_MAX) * 100}%` }}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </article>
  )
}
