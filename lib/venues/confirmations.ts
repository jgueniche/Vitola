import { m } from '@/lib/i18n'
import { VENUE_DONE } from '@/lib/venues/model'

/**
 * What a `?fait=…` means under `/lieux`, in French — the mechanism of
 * `lib/social/confirmations.ts`, for the same reason: most venue gestures
 * navigate (publishing changes the page's banners, withdrawing removes the
 * page), so their confirmation has to arrive with the navigation.
 *
 * Returns null on anything unrecognised: the value is attacker controlled and
 * the worst a bad one may do is render no band.
 */
const SENTENCES: Record<string, string> = {
  [VENUE_DONE.proposed]: m.venues.done.proposed,
  [VENUE_DONE.published]: m.venues.done.published,
  [VENUE_DONE.closed]: m.venues.done.closed,
  [VENUE_DONE.withdrawn]: m.venues.done.withdrawn,
  [VENUE_DONE.reviewed]: m.venues.done.reviewed,
  [VENUE_DONE.reviewDeleted]: m.venues.done.reviewDeleted,
}

export function venueConfirmation(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw
  return code ? (SENTENCES[code] ?? null) : null
}
