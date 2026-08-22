import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { StrengthMeter, type Strength } from '@/components/data/strength-meter'
import { ReportDialog } from '@/components/moderation/report-dialog'
import { KindBadge, ScopeBadge, ScoreMark } from '@/components/reviews/entry-parts'
import { formatEffectiveDate } from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'
import { SCORE_KEYS, SUB_SCORE_MAX, type ScoreKey } from '@/lib/reviews/model'
import {
  aromaLabels,
  getReview,
  listShares,
  listThirds,
  myScoreScale,
  searchMembers,
} from '@/lib/reviews/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { DeleteEntryForm } from './delete-entry-form'
import { EntryEditor } from './entry-editor'
import { SharePanel } from './share-panel'

const copy = m.notebook.entry

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = { title: m.notebook.title }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:gap-6">
      <dt className="text-ink-muted w-48 shrink-0 text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/**
 * One entry of the notebook.
 *
 * Readable by whoever the RLS lets in — the author always, anyone at all when
 * the entry is public, the named people when it is shared — and `notFound()`
 * covers "no such entry" and "not for you" without distinguishing them. That is
 * the same choice the cigar page makes about drafts, for the same reason:
 * telling a reader that an entry exists at an id they cannot open is telling
 * them something about someone else's notebook.
 *
 * The author gets the editor, the recipients panel and the delete button; a
 * visitor gets the entry and a Signaler control. Which of the two is decided by
 * comparing ids here, which is an interface question — who is *shown* a control
 * — and never a security one. Every control behind it is enforced by a policy
 * that does not trust this comparison.
 */
export default async function NotebookEntryPage({ params, searchParams }: Props) {
  const { id } = await params
  const query = await searchParams

  const [entry, user] = await Promise.all([getReview(id), currentUser()])
  if (!entry) notFound()

  const isMine = user?.id === entry.user_id
  const rawQuery = Array.isArray(query.q) ? (query.q[0] ?? '') : (query.q ?? '')

  const [thirds, aromas, shares, results, scale, slaHours] = await Promise.all([
    entry.kind === 'tasting' ? listThirds(entry.id) : Promise.resolve([]),
    aromaLabels(entry.aroma_tags),
    isMine ? listShares(entry.id) : Promise.resolve([]),
    isMine && user && rawQuery.trim().length >= 2
      ? searchMembers(rawQuery, user.id)
      : Promise.resolve([]),
    user ? myScoreScale(user.id) : Promise.resolve(100 as const),
    reportSlaHours(),
  ])

  const thirdLabels = [copy.thirdOne, copy.thirdTwo, copy.thirdThree]
  const scoreLabels = m.notebook.scores
  const subScores = entry.scores as Partial<Record<ScoreKey, number>>
  const hasSubScores = SCORE_KEYS.some((key) => typeof subScores[key] === 'number')

  const authorLabel =
    entry.author?.display_name ?? (entry.author ? `@${entry.author.handle}` : copy.authorHidden)

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <Link href={routes.notebook()} className="eyebrow hover:text-accent-bright w-fit">
          {m.notebook.backToNotebook}
        </Link>

        {entry.cigar ? (
          <Link
            href={routes.cigar(entry.cigar.slug)}
            className="font-display hover:text-accent-bright text-4xl leading-tight"
          >
            {entry.cigar.brand ? <span className="text-ink-muted">{entry.cigar.brand} </span> : null}
            {entry.cigar.commercial_name}
          </Link>
        ) : (
          <h1 className="font-display text-ink-faint text-4xl">{copy.unknownCigar}</h1>
        )}

        <div className="text-ink-faint flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <KindBadge kind={entry.kind} />
          <span>
            {copy.smokedOn} {formatEffectiveDate(entry.smoked_on)}
          </span>
          {entry.updated_at !== entry.created_at ? <span>{copy.edited}</span> : null}
          {entry.is_blind ? <span>{copy.blind}</span> : null}
          {!isMine ? <span>{copy.byAuthor.replace('{author}', authorLabel)}</span> : null}
          {isMine ? <ScopeBadge visibility={entry.visibility} /> : null}
        </div>
      </div>

      <Band variant="divider" />

      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <ScoreMark score={entry.score_total} scale={scale} size="lg" />
        {entry.strength_perceived ? (
          <StrengthMeter strength={entry.strength_perceived as Strength} />
        ) : null}
      </div>

      {hasSubScores ? (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">{copy.subScores}</h2>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {SCORE_KEYS.map((key) => {
              const value = subScores[key]
              if (typeof value !== 'number') return null
              return (
                <div key={key} className="border-rule flex justify-between gap-4 border-b py-1.5">
                  <dt className="text-ink-muted text-sm">{scoreLabels[key]}</dt>
                  {/* Shown as it was typed. `formatScore()` is for a total out
                      of a hundred and would rescale this one into nonsense; a
                      criterion is already out of ten. */}
                  <dd className="font-mono text-sm tabular-nums">
                    {formatCount(value)}
                    <span className="text-ink-faint text-xs">/{SUB_SCORE_MAX}</span>
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      {entry.body ? (
        <p className="text-ink measure text-base leading-relaxed whitespace-pre-line">
          {entry.body}
        </p>
      ) : null}

      {thirds.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">{copy.thirds}</h2>
          <dl className="flex flex-col">
            {thirds.map((third) => (
              <Row key={third.third} label={thirdLabels[third.third - 1] ?? String(third.third)}>
                <span className="whitespace-pre-line">{third.notes}</span>
              </Row>
            ))}
          </dl>
        </section>
      ) : null}

      {aromas.size > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">{copy.aromas}</h2>
          <ul className="flex flex-wrap gap-2">
            {entry.aroma_tags.map((tagId) => {
              const tagLabel = aromas.get(tagId)
              if (!tagLabel) return null
              return (
                <li
                  key={tagId}
                  className="border-rule-strong text-ink rounded-[3px] border px-2 py-1 text-xs"
                >
                  {tagLabel}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <dl className="flex flex-col">
        {entry.smoke_duration_min !== null ? (
          <Row label={copy.duration}>
            {copy.durationValue.replace('{minutes}', String(entry.smoke_duration_min))}
          </Row>
        ) : null}
        {entry.pairing_text ? <Row label={copy.pairing}>{entry.pairing_text}</Row> : null}
        {entry.box_code ? (
          <Row label={copy.boxCode}>
            <span className="font-mono">{entry.box_code}</span>
          </Row>
        ) : null}
        {entry.production_year !== null ? (
          <Row label={copy.productionYear}>{entry.production_year}</Row>
        ) : null}
        {entry.purchase_year !== null ? (
          <Row label={copy.purchaseYear}>{entry.purchase_year}</Row>
        ) : null}
        {entry.humidity_pct !== null ? (
          <Row label={copy.humidity}>
            {copy.humidityValue.replace('{value}', String(entry.humidity_pct))}
          </Row>
        ) : null}
      </dl>

      {isMine ? (
        <>
          <Band variant="divider" />

          <div className="border-rule bg-surface rounded-[3px] border p-5">
            <EntryEditor
              id={entry.id}
              kind={entry.kind}
              smokedOn={entry.smoked_on}
              scoreTotal={entry.score_total}
              body={entry.body}
              visibility={entry.visibility}
              sharedCount={shares.length}
            />
          </div>

          <div className="border-rule bg-surface rounded-[3px] border p-5">
            <SharePanel
              reviewId={entry.id}
              visibility={entry.visibility}
              shares={shares}
              results={results}
              query={rawQuery}
            />
          </div>

          <DeleteEntryForm id={entry.id} />
        </>
      ) : user ? (
        <div className="border-rule border-t pt-6">
          <ReportDialog
            kind="review"
            id={entry.id}
            slaHours={slaHours}
            label={m.moderation.report.triggerReview}
          />
        </div>
      ) : null}
    </main>
  )
}
