import { m } from '@/lib/i18n'
import type { Constants } from '@/lib/supabase/database.types'

type Shape = (typeof Constants)['ref']['Enums']['cigar_shape'][number]

/**
 * Vitola shape labels. The database stores the Spanish trade term as an enum
 * value; the label restores the accent the identifier cannot carry.
 */
export function shapeLabel(shape: string): string {
  const labels = m.referential.shapes as Record<string, string>
  return labels[shape] ?? shape
}

export type { Shape }

/**
 * A release type, in French. The enum values are the trade's own words
 * (edición limitada, reserva…) and stay as they are in the database; the map
 * gives each its display form, and an unknown value renders as itself rather
 * than as a blank — the same rule as `shapeLabel`.
 */
export function releaseTypeLabel(type: string): string {
  const labels = m.referential.releaseTypes as Record<string, string>
  return labels[type] ?? type
}

/**
 * The homologated price, formatted for display.
 *
 * Never shown without its effective date. A price whose date is hidden becomes
 * misinformation within weeks — the decree is revised about monthly, and the
 * schema itself refuses a price with no source and no date. The interface
 * honours the same rule the table does.
 */
export function formatPrice(euros: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(euros)
}

export function formatEffectiveDate(isoDate: string): string {
  // Parsed field by field rather than handed to `new Date(string)`: that
  // constructor reads a bare YYYY-MM-DD as UTC midnight and then renders it in
  // the local zone, which west of Greenwich shows the day before. A price dated
  // one day early is a small lie, and this one is a legal date.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate

  const [, year, month, day] = match
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day))

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc)
}

/**
 * Country codes to French names. `Intl.DisplayNames` rather than a hand-written
 * map: the referential gains origins as it grows, and a map would need editing
 * every time. Falls back to the code, which is still readable.
 */
const countryNames = new Intl.DisplayNames(['fr'], { type: 'region' })

export function countryLabel(code: string): string {
  try {
    return countryNames.of(code) ?? code
  } catch {
    return code
  }
}
