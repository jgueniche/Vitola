import Link from 'next/link'

import { KindBadge, ScopeBadge, ScoreMark } from '@/components/reviews/entry-parts'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import type { ScoreScale } from '@/lib/reviews/model'
import type { ReviewWithContext } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'

const copy = m.notebook.entry

/**
 * One entry, as it appears in a list — the notebook, or a cigar page.
 *
 * `formatEffectiveDate` comes from `lib/cigar` and is named for a price, which
 * is not this. It is reused anyway because it is the one place in the codebase
 * that parses `YYYY-MM-DD` field by field instead of handing it to
 * `new Date(string)` — that constructor reads a bare date as UTC midnight and
 * renders it locally, showing the day before west of Greenwich. Two copies of
 * that trap is one too many; a second name for it would be worse.
 *
 * `showScope` is off on a cigar page and on in the notebook. On a cigar page
 * the badge would be noise on other people's entries — everything visible there
 * that is not yours is public by definition — and a quiet lie on your own, by
 * suggesting the scope is something the page controls.
 */
export function EntryCard({
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
    entry.author?.display_name ??
    (entry.author ? `@${entry.author.handle}` : copy.authorHidden)

  return (
    <article className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          {showCigar ? (
            entry.cigar ? (
              <Link
                href={routes.cigar(entry.cigar.slug)}
                className="font-display hover:text-accent-bright text-lg leading-tight"
              >
                {entry.cigar.brand ? (
                  <span className="text-ink-muted">{entry.cigar.brand} </span>
                ) : null}
                {entry.cigar.commercial_name}
              </Link>
            ) : (
              <span className="text-ink-faint text-lg">{copy.unknownCigar}</span>
            )
          ) : null}

          <div className="text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <KindBadge kind={entry.kind} />
            <span>
              {copy.smokedOn} {formatEffectiveDate(entry.smoked_on)}
            </span>
            {entry.updated_at !== entry.created_at ? <span>{copy.edited}</span> : null}
            {entry.is_blind ? <span>{copy.blind}</span> : null}
            {/* One label, not two. On a cigar page an author would otherwise
                read "Par Test Un" and "Votre entrée" side by side about the
                same row; "Votre entrée" is the one that tells them something. */}
            {showAuthor && !isMine ? (
              <span>{copy.byAuthor.replace('{author}', authorLabel)}</span>
            ) : null}
            {isMine && !showScope ? (
              <span className="text-accent">{m.cigarStats.mine}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {showScope ? <ScopeBadge visibility={entry.visibility} /> : null}
          <ScoreMark score={entry.score_total} scale={scale} size="sm" />
        </div>
      </div>

      {entry.body ? (
        <p className="text-ink measure text-sm leading-relaxed whitespace-pre-line">
          {entry.body}
        </p>
      ) : null}

      {/* Only the author is offered the entry's own page, because that page is
          where one edits, re-scopes and names people. A public entry is readable
          there by anyone the RLS lets in — but sending a visitor to someone
          else's notebook from a cigar page would be an odd door to open. */}
      {isMine ? (
        <div>
          <Link
            href={routes.notebookEntry(entry.id)}
            className="text-ink-muted hover:text-ink text-xs underline underline-offset-4"
          >
            {m.notebook.openEntry}
          </Link>
        </div>
      ) : null}
    </article>
  )
}
