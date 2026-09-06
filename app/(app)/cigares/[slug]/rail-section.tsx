import Link from 'next/link'

import { ScoreMark } from '@/components/reviews/entry-parts'
import { buttonClass } from '@/components/ui/button'
import { formatEffectiveDate } from '@/lib/cigar'
import { formatCount, todayInBrandZone } from '@/lib/format'
import { listHumidors, lotsForCigar } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import type { ScoreScale } from '@/lib/reviews/model'
import type { ReviewWithContext } from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { venueOptions } from '@/lib/venues/queries'

import { SmokeForm } from './smoke-form'

const copy = m.sheet

/**
 * The rail: you and this cigar.
 *
 * The second of the three zones of the rebuilt sheet (design audit,
 * 5 septembre 2026) — what the referential knows is the first, what the
 * members say is the third. It answers the member's questions in the order
 * they come with the cigar in hand: do I have it, am I smoking one now, what
 * did I think of it last time. Sticky on a desk so the gesture stays under
 * the hand while one reads the others; a card in the flow on a phone, with a
 * bar under the thumb.
 *
 * A visitor gets one card and one sentence — the sign-in invitation — where
 * the old sheet showed three identical ones in place of three forms.
 *
 * `entries` arrives from the page rather than being read again: the page
 * already reads every entry the RLS lets this reader see, and "mine" is a
 * question of display, not a visibility filter. Nothing here decides who may
 * read what.
 */
export async function RailSection({
  cigar,
  entries,
  scale,
  gestureOpen,
}: {
  cigar: { id: string; slug: string; commercial_name: string }
  entries: ReviewWithContext[]
  scale: ScoreScale
  gestureOpen: boolean
}) {
  const user = await currentUser()

  if (!user) {
    return (
      <section
        aria-labelledby="vous"
        className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-6"
      >
        <p className="eyebrow">{copy.myEntries}</p>
        <h2 id="vous" className="font-display text-display-sm">
          {copy.signInTitle}
        </h2>
        <p className="text-ink-muted text-sm leading-relaxed">{copy.signInBody}</p>
        <Link
          href={`${routes.signIn()}?suite=${encodeURIComponent(routes.cigar(cigar.slug))}`}
          className={buttonClass({ size: 'lg', className: 'w-full' })}
        >
          {m.auth.title}
        </Link>
        <p className="text-ink-faint text-xs">{copy.signInNote}</p>
      </section>
    )
  }

  /* The venues only when the gesture is open: three hundred rows for a
     select nobody sees is a query too many on every sheet. */
  const [lots, humidors, venues] = await Promise.all([
    lotsForCigar(cigar.id),
    listHumidors(),
    gestureOpen ? venueOptions() : Promise.resolve([]),
  ])
  const held = lots.reduce((sum, lot) => sum + lot.qty, 0)
  /* Oldest first by `lotsForCigar`, so the lot offered is the one that has
     rested longest — what FIFO means in a humidor. */
  const first = lots[0] ?? null
  const target = humidors.find((humidor) => humidor.is_default) ?? humidors[0] ?? null
  const mine = entries.filter((entry) => entry.user_id === user.id)
  const openGesture = `${routes.cigar(cigar.slug)}?geste=fumer#geste`

  return (
    <>
      <div id="geste" className="flex flex-col gap-4 lg:sticky lg:top-6">
        <section
          aria-labelledby="vous"
          className="border-rule bg-surface flex flex-col gap-5 rounded-[3px] border p-6"
        >
          <h2 id="vous" className="eyebrow">
            {copy.eyebrow}
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {held > 0 ? copy.inCave.replace('{count}', formatCount(held)) : copy.notInCave}
              </span>
              {first ? (
                <span className="text-ink-muted text-xs">
                  {first.purchase_date
                    ? copy.lot
                        .replace('{date}', formatEffectiveDate(first.purchase_date))
                        .replace('{days}', String(first.aging_days ?? 0))
                    : copy.lotNoDate}
                </span>
              ) : null}
            </div>
            {first ? (
              <Link
                href={routes.humidorDetail(first.humidor_id)}
                className="text-ink-muted hover:text-ink text-xs underline underline-offset-4"
              >
                {copy.openCave}
              </Link>
            ) : target ? (
              <Link
                href={`${routes.humidorDetail(target.id)}?q=${encodeURIComponent(cigar.slug.replaceAll('-', ' '))}`}
                className="text-ink-muted hover:text-ink text-xs underline underline-offset-4"
              >
                {m.humidor.putAway}
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {gestureOpen ? null : (
              <Link href={openGesture} className={buttonClass({ size: 'lg', className: 'w-full' })}>
                {m.humidor.smoke}
              </Link>
            )}
            <Link
              href={routes.cigarTasting(cigar.slug)}
              className={buttonClass({ variant: 'secondary', className: 'w-full' })}
            >
              {copy.tasting}
            </Link>
          </div>

          <div className="border-rule flex flex-col gap-2.5 border-t pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="eyebrow">{copy.myEntries}</span>
              {mine.length > 0 ? (
                <span className="text-ink-faint text-xs">
                  {copy.myEntriesCount.replace('{count}', formatCount(mine.length))}
                </span>
              ) : null}
            </div>
            {mine.length === 0 ? (
              <p className="text-ink-faint text-xs">{copy.myEntriesNone}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={routes.notebookEntry(entry.id)}
                      className="text-ink hover:text-accent-bright grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-3"
                    >
                      <ScoreMark score={entry.score_total} scale={scale} size="sm" />
                      <span className="text-ink-muted text-xs">
                        {formatEffectiveDate(entry.smoked_on)}
                        {' · '}
                        {entry.kind === 'tasting' ? m.notebook.kind.tasting : m.notebook.kind.log}
                        {' · '}
                        <span className="text-ink-faint">{m.notebook.scope[entry.visibility]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-ink-faint text-xs leading-relaxed">{copy.privacyNote}</p>
        </section>

        {gestureOpen ? (
          <section
            aria-label={copy.gesture.title}
            className="border-rule-strong bg-surface rounded-[3px] border p-6"
          >
            <SmokeForm
              cigarId={cigar.id}
              slug={cigar.slug}
              today={todayInBrandZone()}
              lot={
                first ? { id: first.id, qty: first.qty, purchaseDate: first.purchase_date } : null
              }
              venues={venues.map((venue) => ({ id: venue.id, label: venue.label }))}
            />
          </section>
        ) : null}
      </div>

      {/* The gesture under the thumb, on a phone, while the form is closed. The
          bar is the mobile form of the sticky rail: the same one action, always
          reachable, never in the way of the reading above it. */}
      {gestureOpen ? null : (
        <div className="border-rule-strong bg-surface fixed inset-x-0 bottom-0 z-10 border-t px-4 py-3 lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="eyebrow text-ink truncate">{cigar.commercial_name}</span>
              <span className="text-ink-muted text-xs">
                {held > 0 ? copy.thumbBar.replace('{count}', formatCount(held)) : copy.notInCave}
              </span>
            </span>
            <Link href={openGesture} className={buttonClass({ size: 'lg', className: 'flex-1' })}>
              {m.humidor.smoke}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
