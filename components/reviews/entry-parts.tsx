import { formatScore } from '@/lib/format'
import { m } from '@/lib/i18n'
import { SCOPE_TRAITS, type ReviewKind, type ReviewVisibility, type ScoreScale } from '@/lib/reviews/model'
import { cn } from '@/lib/utils'

const scopeCopy = m.notebook.scope

/**
 * The small marks a notebook entry wears: its score, its scope, its nature.
 *
 * Server components, all three — they render what they are given and hold no
 * state. Kept together because they are always used together, and apart from
 * `entry-card` because the entry page composes them differently.
 */

/**
 * A score, on the member's chosen scale (§5.4).
 *
 * `formatScore()` divides at the last moment; nothing converts on the way into
 * the database, where a score is always out of a hundred. Storing the displayed
 * value would put two scales in one column and lose which is which.
 *
 * An entry without a score is not a failure to fill a field: a notebook entry
 * may be a sentence and no number, and `reviews_log_says_something` allows
 * exactly that. It is written out rather than left blank so the row does not
 * read as broken.
 */
export function ScoreMark({
  score,
  scale = 100,
  size = 'md',
}: {
  score: number | null
  scale?: ScoreScale
  size?: 'sm' | 'md' | 'lg'
}) {
  if (score === null) {
    return <span className="text-ink-faint text-sm">{m.notebook.entry.noScore}</span>
  }

  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        className={cn(
          'font-mono tabular-nums',
          size === 'lg' && 'text-3xl',
          size === 'md' && 'text-xl',
          size === 'sm' && 'text-base',
        )}
      >
        {formatScore(score, scale)}
      </span>
      <span className="text-ink-faint font-mono text-xs">/{scale}</span>
    </span>
  )
}

const SCOPE_LABELS: Record<ReviewVisibility, string> = {
  private: scopeCopy.private,
  shared: scopeCopy.shared,
  followers: scopeCopy.followers,
  public: scopeCopy.public,
}

/**
 * Who can read this entry, said on the entry itself.
 *
 * Shown on every entry a member owns, including the private ones — especially
 * the private ones. A notebook whose scope is only visible while editing is a
 * notebook one has to open to trust, and the whole promise of ADR 0004's
 * per-entry scope is that one can see it at a glance.
 *
 * `followers` is drawn in the caution tone rather than the neutral one, and the
 * reason changed in P3 without the tone changing. It used to mark a scope that
 * reached nobody at all — `public.follows` did not exist, so the SELECT branch
 * could not either. Migration 0010 wrote both. What the tone now marks is the
 * scope whose audience is **living and free to join**: the badge's share of the
 * warning `ScopeSelector` spells out in full.
 */
export function ScopeBadge({ visibility }: { visibility: ReviewVisibility }) {
  const living = SCOPE_TRAITS[visibility].livingAudience

  return (
    <span
      className={cn(
        'eyebrow inline-flex items-center rounded-[3px] border px-2 py-0.5 text-xs',
        visibility === 'public' && 'border-accent text-accent',
        visibility === 'shared' && 'border-rule-strong text-ink-muted',
        visibility === 'private' && 'border-rule text-ink-faint',
        living && 'border-caution text-caution',
      )}
      title={living ? scopeCopy.followersOpen : undefined}
    >
      {SCOPE_LABELS[visibility]}
    </span>
  )
}

/** Log or tasting — the discriminant of ADR 0004's D1, made visible. */
export function KindBadge({ kind }: { kind: ReviewKind }) {
  return (
    <span className="text-ink-faint eyebrow text-xs">
      {kind === 'tasting' ? m.notebook.kind.tasting : m.notebook.kind.log}
    </span>
  )
}
