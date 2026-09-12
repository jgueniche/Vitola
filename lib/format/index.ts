import { BRAND } from '@/lib/brand'
import { INTL_LOCALE, LOCALE } from '@/lib/i18n'

/** The tag every formatter here uses: the BUILD's language, not the brand's. */
const FORMAT_LOCALE = INTL_LOCALE[LOCALE]

/** Cepo x length, the way it is written on a box: `52 × 150 mm`. */
export function formatDimensions(ringGauge: number, lengthMm: number): string {
  return `${ringGauge} × ${lengthMm} mm`
}

/** Millimetres to inches, for the EN locale of P8. One decimal is the trade norm. */
export function millimetresToInches(lengthMm: number): number {
  return Math.round((lengthMm / 25.4) * 10) / 10
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(FORMAT_LOCALE, { dateStyle: 'long' }).format(date)
}

/**
 * A moment, with its hour — an event starts at 20 h, not on a day.
 *
 * The zone is stated, unlike `formatDate` above, and for the reason
 * `todayInBrandZone` gives at the bottom of this file: a server renders in UTC,
 * so a Paris evening at 20 h would be announced at 18 h. A date alone survives
 * that; a time does not.
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(FORMAT_LOCALE, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: BRAND.timeZone,
  }).format(date)
}

/**
 * A `YYYY-MM` bucket as a short month and a two-digit year: `févr. 26`, `Feb 26`.
 *
 * `/statistiques` carried a hand-written array of twelve French abbreviations,
 * which is exactly what `Intl` exists to avoid — and which the English build
 * rendered « août 26 » under `lang="en"`. The month is formatted from a UTC
 * midday rather than the 1st at 00:00: the zone shift of a midnight would
 * occasionally name the previous month.
 */
export function formatMonthBucket(bucket: string): string {
  const [year, month] = bucket.split('-')
  const index = Number(month)
  if (!year || !Number.isInteger(index) || index < 1 || index > 12) return bucket

  const label = new Intl.DateTimeFormat(FORMAT_LOCALE, {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, index - 1, 1, 12)))

  return `${label} ${year.slice(2)}`
}

/** The hour alone, for the second half of an interval on the same day. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(FORMAT_LOCALE, {
    timeStyle: 'short',
    timeZone: BRAND.timeZone,
  }).format(date)
}

/**
 * The offset of the brand's zone at a given instant, in milliseconds.
 *
 * `Intl` can render an instant in a named zone but cannot read an offset back
 * out, so the offset is *measured*: format the instant in the zone, reassemble
 * those parts as if they were UTC, and the difference is the offset. It follows
 * daylight saving without a table, which is the point — Paris is +1 in January
 * and +2 in July, and an event announced for 20 h must be 20 h in both.
 */
function brandZoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAND.timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? '0')

  const asIfUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    /* `hour12: false` renders midnight as 24 in some ICU versions. */
    part('hour') % 24,
    part('minute'),
    part('second'),
  )
  return asIfUtc - instant.getTime()
}

/**
 * A `<input type="datetime-local">` value, read as a wall clock in the brand's
 * zone, as an instant.
 *
 * The input gives `2026-09-10T20:00` and says nothing about a zone; PostgREST
 * hands a bare timestamp to a session running in UTC, so "20 h" would be stored
 * as 20 h UTC — 22 h in Paris in summer. Two hours out, silently, on the one
 * field of an event that people plan their evening around.
 *
 * The offset is measured at the instant itself, so the shift is right on both
 * sides of a daylight-saving change. Inside the spring-forward gap the wall
 * clock named does not exist; this returns the instant an hour either side
 * rather than refusing, which is what a calendar should do with `02:30` on the
 * last Sunday of March.
 */
export function fromBrandZoneWallClock(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null

  const naive = new Date(`${local.length === 16 ? `${local}:00` : local}Z`)
  if (Number.isNaN(naive.getTime())) return null

  return new Date(naive.getTime() - brandZoneOffsetMs(naive))
}

/** The reverse, for a form that reopens on a value it once wrote. */
export function toBrandZoneWallClock(instant: Date): string {
  const shifted = new Date(instant.getTime() + brandZoneOffsetMs(instant))
  return shifted.toISOString().slice(0, 16)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(FORMAT_LOCALE).format(value)
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
