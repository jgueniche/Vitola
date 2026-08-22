import { BRAND } from '@/lib/brand'

/** Cepo x length, the way it is written on a box: `52 × 150 mm`. */
export function formatDimensions(ringGauge: number, lengthMm: number): string {
  return `${ringGauge} × ${lengthMm} mm`
}

/** Millimetres to inches, for the EN locale of P8. One decimal is the trade norm. */
export function millimetresToInches(lengthMm: number): number {
  return Math.round((lengthMm / 25.4) * 10) / 10
}

/**
 * Scores are stored on 100 (§5.4). Members may display them on 20.
 * Rounded to one decimal, never up to a flattering integer.
 */
export function formatScore(scoreOutOf100: number, scale: 100 | 20 = 100): string {
  const value = scale === 100 ? scoreOutOf100 : (scoreOutOf100 / 100) * 20
  return new Intl.NumberFormat(BRAND.locale, {
    minimumFractionDigits: scale === 100 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(BRAND.locale, { dateStyle: 'long' }).format(date)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(BRAND.locale).format(value)
}

/**
 * Today, in the zone the audience lives in, as `YYYY-MM-DD`.
 *
 * The value a `<input type="date">` wants, and the default for the notebook's
 * "quand l'avez-vous fumé". Formatted through `en-CA`, whose short date format
 * *is* ISO 8601 — the alternative is reading three parts out of a
 * `formatToParts` and reassembling them, which is the same thing written longer.
 *
 * The zone matters here and nowhere else so far: a server renders in UTC, so
 * between midnight and 2 a.m. in Paris it would propose yesterday — precisely
 * when someone puts a cigar down and writes it up.
 */
export function todayInBrandZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRAND.timeZone }).format(now)
}
