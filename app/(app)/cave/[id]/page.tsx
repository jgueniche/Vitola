import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { formatPrice } from '@/lib/cigar'
import { formatCount, todayInBrandZone } from '@/lib/format'
import { fillRatio, maturityStage, needsRotation, type MaturityStage } from '@/lib/humidor/model'
import {
  getHumidor,
  listHumidors,
  listLedger,
  listLots,
  listReadings,
  type LedgerRow,
  type LotWithCigar,
} from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { EMPTY_FACETS } from '@/lib/search/facets'
import { searchCigars } from '@/lib/search/query'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { HumidorForm } from '../humidor-form'
import { AddLotForm, DeleteHumidorForm, ImportForm, ReadingForm } from './cave-forms'
import { DeleteLotForm, EventForm, MoveForm, SmokeForm } from './lot-forms'

export const metadata: Metadata = { title: m.humidor.title }

const copy = m.humidor

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * One humidor: what is in it, what has left it, and what the hygrometer says.
 *
 * Three pieces of interface state — the search term, the cigar being added, the
 * lot being worked on — and all three live in the URL rather than in a client
 * component. That is `app/CLAUDE.md`'s rule and it pays here more than usual: a
 * lot panel opened by a link is shareable, survives the refresh that follows
 * every write, and needs no JavaScript to open. The forms inside it are the
 * only client code on the page.
 *
 * A humidor that does not exist and one that is not yours are the same 404, and
 * that is the RLS answering rather than this page choosing: `getHumidor()`
 * returns null in both cases because the policy returns no row. "Interdit"
 * would confirm that somebody else's cave exists.
 */
export default async function HumidorDetailPage({ params, searchParams }: Props) {
  const user = await currentUser()
  const { id } = await params
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.humidorDetail(id))}`)
  }

  const humidor = await getHumidor(id)
  if (!humidor) notFound()

  const query = await searchParams
  const term = (one(query.q) ?? '').trim()
  const adding = one(query.ajouter)
  const openLot = one(query.lot)
  const today = todayInBrandZone()

  const [lots, readings, humidors] = await Promise.all([
    listLots(id),
    listReadings(id),
    listHumidors(),
  ])

  const held = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const ratio = fillRatio(held, humidor.capacity)
  const value = lots.reduce((sum, lot) => sum + (lot.stock_value_eur ?? 0), 0)
  const priced = lots.some((lot) => lot.stock_value_eur !== null)

  const found = term
    ? await searchCigars({ ...EMPTY_FACETS, query: term })
    : { cigars: [], total: 0, page: 1, pageCount: 0 }

  const addingCigar = adding ? found.cigars.find((cigar) => cigar.id === adding) : undefined

  const lot = openLot ? lots.find((row) => row.id === openLot) : undefined
  const ledger = lot ? await listLedger(lot.id) : []

  const withParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = { q: term || undefined, ajouter: adding, lot: openLot, ...next }
    for (const [key, entry] of Object.entries(merged)) if (entry) params.set(key, entry)
    const qs = params.toString()
    return qs ? `${routes.humidorDetail(id)}?${qs}` : routes.humidorDetail(id)
  }

  const latest = readings[0]

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Link href={routes.humidor()} className="eyebrow text-ink-muted hover:text-ink w-fit">
          {copy.backToHumidor}
        </Link>
        <h1 className="font-display text-display-md leading-tight">{humidor.name}</h1>
        <p className="text-ink-muted text-sm">
          {humidor.capacity
            ? copy.fill
                .replace('{count}', String(held))
                .replace('{capacity}', String(humidor.capacity))
            : copy.fillNoCapacity.replace('{count}', String(held))}
          {priced ? ` · ${formatPrice(value)}` : ''}
        </p>
        {ratio !== null ? (
          <span className="border-rule-strong h-2 w-full max-w-xs overflow-hidden rounded-[2px] border">
            <span
              className={cn('block h-full', ratio >= 1 ? 'bg-negative' : 'bg-accent')}
              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
            />
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------ inventory -- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.lotsTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lotsLede}</p>
        </div>

        {lots.length === 0 ? (
          <EmptyState title={copy.emptyLotsTitle} description={copy.emptyLotsBody} />
        ) : (
          <ul className="flex flex-col gap-2">
            {lots.map((row) => (
              <li key={row.id} className="flex flex-col gap-3">
                <Link
                  href={
                    openLot === row.id
                      ? withParams({ lot: undefined })
                      : withParams({ lot: row.id })
                  }
                  className={cn(
                    'bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[3px] border px-4 py-3 transition-colors duration-(--duration-quick)',
                    openLot === row.id ? 'border-accent' : 'border-rule hover:border-rule-strong',
                  )}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-ink">
                      {row.cigar?.commercial_name ?? '—'}
                      {row.cigar?.brand ? (
                        <span className="text-ink-muted"> · {row.cigar.brand}</span>
                      ) : null}
                    </span>
                    <span className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
                      <span>{ageLabel(row.aging_days)}</span>
                      {maturityLabel(row.aging_days) ? (
                        <span>· {maturityLabel(row.aging_days)}</span>
                      ) : null}
                      {row.position ? <span>· {row.position}</span> : null}
                      {needsRotation(row.aging_days, row.last_smoked_on) ? (
                        <span className="text-accent">· {copy.rotationFlag}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-3">
                    {row.stock_value_eur !== null ? (
                      <span className="text-ink-muted text-sm">
                        {formatPrice(row.stock_value_eur)}
                      </span>
                    ) : null}
                    <span className="text-base font-medium">
                      {row.qty === 0 ? copy.emptyLot : formatCount(row.qty)}
                    </span>
                  </span>
                </Link>

                {openLot === row.id ? (
                  <LotPanel
                    lot={row}
                    ledger={ledger}
                    humidorId={id}
                    humidors={humidors}
                    today={today}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- adding ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.addTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.addLede}</p>
        </div>

        {/* A GET form, so the search is a URL: no JavaScript, back-button
            correct, and the result can be linked to. Same rule as the faceted
            search of P1. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cigar-search">{copy.searchLabel}</Label>
            <Input
              id="cigar-search"
              name="q"
              defaultValue={term}
              placeholder={copy.searchPlaceholder}
              className="w-64"
            />
          </div>
          <Button type="submit" variant="secondary">
            {copy.searchAction}
          </Button>
        </form>

        {term && found.cigars.length === 0 ? (
          <EmptyState
            title={copy.searchNoResult}
            description={copy.addLede}
            action={
              <Link href={routes.cigars()}>
                <Button variant="secondary" size="sm">
                  {copy.searchBrowse}
                </Button>
              </Link>
            }
          />
        ) : null}

        {found.cigars.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {found.cigars.slice(0, 8).map((cigar) => (
              <li
                key={cigar.id}
                className="border-rule bg-surface flex items-center justify-between gap-3 rounded-[3px] border px-4 py-2"
              >
                <span className="text-sm">
                  {cigar.commercial_name}
                  {cigar.brands?.name ? (
                    <span className="text-ink-muted"> · {cigar.brands.name}</span>
                  ) : null}
                </span>
                <Link href={withParams({ ajouter: cigar.id })}>
                  <Button variant="secondary" size="sm">
                    {copy.putAway}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {addingCigar ? (
          <AddLotForm
            humidorId={id}
            cigarId={addingCigar.id}
            cigarName={addingCigar.commercial_name}
            today={today}
          />
        ) : null}
      </section>

      {/* --------------------------------------------------- hygrometry ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.readingsTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.readingsLede}</p>
        </div>

        {latest && humidor.target_rh !== null && latest.rh !== null ? (
          <p className="text-ink-muted text-sm">
            {copy.readingDrift.replace(
              '{value}',
              (Math.round((latest.rh - humidor.target_rh) * 10) / 10).toString(),
            )}
          </p>
        ) : null}

        <ReadingForm humidorId={id} />

        {readings.length === 0 ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.readingsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {readings.map((reading) => (
              <li
                key={reading.id}
                className="border-rule flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"
              >
                <span className="text-ink-muted">
                  {new Date(reading.recorded_at).toLocaleString('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="flex items-center gap-4">
                  {reading.rh !== null ? <span>{reading.rh} %</span> : null}
                  {reading.temp_c !== null ? <span>{reading.temp_c} °C</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------- CSV ----- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.csvTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.csvLede}</p>
        </div>
        <a href={routes.humidorExport()} download className="w-fit">
          <Button variant="secondary">{copy.csvExport}</Button>
        </a>
        <ImportForm humidorId={id} />
      </section>

      {/* ---------------------------------------------------- settings ----- */}
      <section className="border-rule flex flex-col gap-4 border-t pt-8">
        <h2 className="font-display text-display-sm">{copy.editTitle}</h2>
        <HumidorForm
          mode="edit"
          defaults={{
            id: humidor.id,
            name: humidor.name,
            capacity: humidor.capacity,
            targetRh: humidor.target_rh,
            targetTemp: humidor.target_temp,
            isDefault: humidor.is_default,
          }}
        />
        <DeleteHumidorForm id={humidor.id} />
      </section>
    </main>
  )
}

/**
 * What one can do with a lot, and what has already been done to it.
 *
 * The ledger is above the controls rather than below: the first question anyone
 * opening a lot asks is "where did the other three go", and the answer should
 * not require scrolling past four forms.
 */
function LotPanel({
  lot,
  ledger,
  humidorId,
  humidors,
  today,
}: {
  lot: LotWithCigar
  ledger: LedgerRow[]
  humidorId: string
  humidors: { id: string; name: string }[]
  today: string
}) {
  return (
    <div className="border-rule bg-surface-raised flex flex-col gap-6 rounded-[3px] border p-4">
      <section className="flex flex-col gap-2">
        <h3 className="eyebrow">{copy.ledgerTitle}</h3>
        {ledger.length === 0 ? (
          <p className="text-ink-muted text-sm">{copy.ledgerEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {ledger.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <span className="text-ink-muted">
                  {event.occurred_at} · {ledgerLabel(event.type)}
                </span>
                <span className="flex items-center gap-3">
                  {event.review_id ? (
                    <Link
                      href={routes.notebookEntry(event.review_id)}
                      className="text-accent underline"
                    >
                      {copy.ledgerSeeEntry}
                    </Link>
                  ) : null}
                  <span>{event.qty > 0 ? `+${event.qty}` : event.qty}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lot.qty > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">{copy.smokeTitle}</h3>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.smokeLede}</p>
          <SmokeForm itemId={lot.id} slug={lot.cigar?.slug ?? null} today={today} max={lot.qty} />
        </section>
      ) : (
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.emptyLotHint}</p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="eyebrow">{copy.eventTitle}</h3>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.eventLede}</p>
        <EventForm itemId={lot.id} humidorId={humidorId} today={today} />
      </section>

      <section className="flex flex-wrap items-end justify-between gap-3">
        <MoveForm itemId={lot.id} humidors={humidors} currentId={humidorId} />
        <DeleteLotForm itemId={lot.id} humidorId={humidorId} />
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

const LEDGER_LABELS: Record<string, string> = {
  add: copy.ledgerAdd,
  smoke: copy.ledgerSmoke,
  gift: copy.ledgerGift,
  loss: copy.ledgerLoss,
  move: copy.ledgerMove,
  adjust: copy.ledgerAdjust,
}

function ledgerLabel(type: string): string {
  return LEDGER_LABELS[type] ?? type
}

const MATURITY_LABELS: Record<MaturityStage, string> = {
  fresh: copy.maturityFresh,
  settling: copy.maturitySettling,
  ready: copy.maturityReady,
  mature: copy.maturityMature,
}

function maturityLabel(agingDays: number | null): string | null {
  const stage = maturityStage(agingDays)
  return stage ? MATURITY_LABELS[stage] : null
}

/**
 * An age, at the resolution it deserves.
 *
 * Days for the first three months, months to two years, then years. "742 jours"
 * is precise and unreadable; nobody rests a cigar to the day, and rendering it
 * that way suggests we measured something we did not.
 */
function ageLabel(agingDays: number | null): string {
  if (agingDays === null) return copy.ageUnknown
  if (agingDays < 90) return copy.ageDays.replace('{count}', String(agingDays))
  if (agingDays < 730) return copy.ageMonths.replace('{count}', String(Math.round(agingDays / 30)))
  return copy.ageYears.replace('{count}', String(Math.floor(agingDays / 365)))
}
