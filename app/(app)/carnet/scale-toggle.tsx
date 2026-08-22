import { m } from '@/lib/i18n'
import type { ScoreScale } from '@/lib/reviews/model'
import { cn } from '@/lib/utils'

import { setScoreScale } from './actions'

const copy = m.notebook.scale

/**
 * The /100 ↔ /20 switch of §5.4.
 *
 * A server component with two one-button forms rather than a client toggle: the
 * preference is stored in `profile_settings.preferences`, so the change is a
 * write and a re-render either way. Two POSTs cost nothing and work without
 * JavaScript; a controlled toggle would have added a client bundle to save a
 * round trip nobody is waiting on.
 *
 * Buttons, not links. Flipping a stored preference changes state, and a GET that
 * changes state is fired by any prefetcher that walks past it — the same
 * reasoning that made "Se déconnecter" a form in the site header.
 *
 * The switch lives here rather than in `/parametres`, which does not exist yet.
 * When it does, this stays: it is the page where the scale is read, and a
 * display preference is best changed while looking at what it changes.
 */
export function ScaleToggle({ current }: { current: ScoreScale }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="eyebrow">{copy.legend}</span>

      <div className="flex gap-2">
        {([100, 20] as const).map((scale) => (
          <form key={scale} action={setScoreScale}>
            <input type="hidden" name="scale" value={scale} />
            <button
              type="submit"
              aria-pressed={current === scale}
              className={cn(
                'rounded-[3px] border px-3 py-1 text-sm transition-colors duration-(--duration-quick)',
                current === scale
                  ? 'border-accent text-accent'
                  : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink',
              )}
            >
              {scale === 100 ? copy.hundred : copy.twenty}
            </button>
          </form>
        ))}
      </div>

      <p className="text-ink-faint text-xs">{copy.hint}</p>
    </div>
  )
}
