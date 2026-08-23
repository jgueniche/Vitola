import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { venueConfirmation } from '@/lib/venues/confirmations'
import {
  formatDistance,
  isVenueType,
  VENUE_SEARCH,
  type VenueType,
} from '@/lib/venues/model'
import {
  listPendingVenues,
  listVenues,
  venuesFlag,
  venuesNearby,
  type NearbyVenue,
  type VenueRow,
} from '@/lib/venues/queries'
import { currentUser } from '@/lib/supabase/server'

import { LocateButton } from './locate-button'

export const metadata: Metadata = { title: m.venues.title }

const copy = m.venues

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * L'annuaire des lieux (ADR 0011, F8).
 *
 * Readable by a signed-out visitor past the age gate, like the referential:
 * `venues_select_public` serves published rows to `anon`. The whole section
 * lives behind `venues_enabled` (Q6) — flag off, this is a 404, and the flag's
 * payload lists the types the directory offers.
 *
 * Two searches, one page. Text — a needle over names and cities, plain `ilike`
 * over two hundred rows. Distance — `venues_nearby()` when the URL carries a
 * position, which only « Me localiser » or a shared link puts there: the
 * position is read on the device, when asked, and stored nowhere.
 */
export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const flag = await venuesFlag()
  if (!flag.enabled) notFound()

  const query = await searchParams
  const done = venueConfirmation(query.fait)
  const q = firstParam(query.q)?.trim() || undefined
  const rawType = firstParam(query.type)
  const type: VenueType | undefined =
    rawType && isVenueType(rawType) && flag.types.includes(rawType) ? rawType : undefined

  const lat = Number(firstParam(query.lat))
  const lng = Number(firstParam(query.lng))
  const hasPoint =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const radiusKm = Math.min(
    VENUE_SEARCH.radiusMaxKm,
    Math.max(
      VENUE_SEARCH.radiusMinKm,
      Math.round(Number(firstParam(query.rayon)) || VENUE_SEARCH.radiusDefaultKm),
    ),
  )

  const user = await currentUser()

  const [nearby, listed, pending] = await Promise.all([
    hasPoint
      ? venuesNearby({ lat, lng, radiusKm, offeredTypes: flag.types, type })
      : Promise.resolve<NearbyVenue[]>([]),
    hasPoint
      ? Promise.resolve<VenueRow[]>([])
      : listVenues({ offeredTypes: flag.types, type, q }),
    user ? listPendingVenues() : Promise.resolve<VenueRow[]>([]),
  ])

  const shown = hasPoint ? nearby.length : listed.length

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="text-ink-muted measure text-xs leading-relaxed">{copy.sourceNote}</p>
      </div>

      <Band variant="divider" />

      {done ? (
        <p role="status" className="text-ink-muted text-sm">
          {done}
        </p>
      ) : null}

      {/* The text search: a GET form, like every search on the site — the
          result reloads, shares, and works before hydration. */}
      <form method="get" action={routes.venues()} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="lieux-q">{copy.list.qLabel}</Label>
          <Input
            id="lieux-q"
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder={copy.list.qPlaceholder}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="lieux-type">{copy.list.typeLabel}</Label>
          <Select id="lieux-type" name="type" defaultValue={type ?? ''}>
            <option value="">{copy.list.typeAll}</option>
            {flag.types.map((value) => (
              <option key={value} value={value}>
                {copy.types[value]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {copy.list.submit}
        </Button>
      </form>

      {/* The distance search. The radius rides the same GET form idea: it is a
          link parameter, and « Me localiser » is the only client code here. */}
      <div className="border-rule bg-surface flex flex-wrap items-center gap-3 rounded-[3px] border p-4">
        <p className="text-ink-muted flex-1 text-sm leading-relaxed">
          {hasPoint
            ? copy.list.nearActive.replace('{km}', String(radiusKm))
            : copy.list.locateHint}
        </p>
        {hasPoint ? (
          <Link href={routes.venues()} className="text-accent text-sm hover:underline">
            {copy.list.clearNear}
          </Link>
        ) : (
          <LocateButton radiusKm={radiusKm} type={type} q={q} />
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-ink-muted text-sm tabular-nums">
          {shown === 1 ? copy.list.countOne : copy.list.countMany.replace('{count}', String(shown))}
        </p>
        <Link href={routes.venuePropose()} className="text-accent text-sm hover:underline">
          {copy.list.propose}
        </Link>
      </div>

      {shown === 0 ? (
        hasPoint ? (
          <EmptyState title={copy.list.noneNearTitle} description={copy.list.noneNearBody} />
        ) : q || type ? (
          <EmptyState title={copy.list.noMatchTitle} description={copy.list.noMatchBody} />
        ) : (
          <EmptyState title={copy.list.emptyTitle} description={copy.list.emptyBody} />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {(hasPoint ? nearby : listed).map((venue) => (
            <li
              key={venue.id}
              className="border-rule bg-surface flex flex-col gap-1 rounded-[3px] border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={routes.venue(venue.slug)}
                  className="font-display text-ink hover:text-accent text-xl transition-colors duration-(--duration-quick)"
                >
                  {venue.name}
                </Link>
                <p className="eyebrow text-xs">{copy.types[venue.type]}</p>
              </div>
              <p className="text-ink-muted text-sm">
                {[venue.address, venue.postal_code, venue.city].filter(Boolean).join(', ')}
                {'distance_m' in venue ? (
                  <span className="text-ink-muted">
                    {' '}
                    — {copy.list.at} {formatDistance(venue.distance_m)}
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      {shown >= VENUE_SEARCH.maxRows ? (
        <p className="text-ink-muted text-xs">
          {copy.list.countCapped.replace('{count}', String(VENUE_SEARCH.maxRows))}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Band variant="divider" />
          <h2 className="font-display text-2xl">
            {pending.some((venue) => venue.created_by !== user?.id)
              ? copy.pending.titleEditor
              : copy.pending.titleMine}
          </h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">
            {pending.some((venue) => venue.created_by !== user?.id)
              ? copy.pending.ledeEditor
              : copy.pending.ledeMine}
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((venue) => (
              <li key={venue.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <Link href={routes.venue(venue.slug)} className="text-accent hover:underline">
                  {venue.name}
                </Link>
                <span className="text-ink-muted">
                  {copy.types[venue.type]} — {venue.city}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
