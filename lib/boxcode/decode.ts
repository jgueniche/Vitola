/**
 * Reading a Cuban box code, as a parse rather than a lookup.
 *
 * The bottom of a Habanos box carries, since 1985, three letters for the
 * factory and three more for the month, followed by two digits for the year:
 *
 *     OSU  ABR  19
 *     └factory └mois └année
 *
 * Everything here is pure. The **meaning** of the letters lives in
 * `ref.box_codes` and is read from the database, because that is data we may be
 * wrong about; the **shape** lives here, because it is a format and formats do
 * not change per row.
 *
 * The one thing this file refuses to do is guess. A three-letter group that is
 * not one of the twelve months is reported as *unrecognised*, never as a
 * probable factory: the factory codes were deliberately reshuffled by Habanos
 * more than once, and `supabase/seed/PROVENANCE.md` rates our six of them
 * "faible". Presenting a guess with the same confidence as a fact is how a
 * reference stops being one.
 */

export type Segment =
  | { kind: 'letters'; value: string }
  | { kind: 'digits'; value: string }

/**
 * Splits a raw code into letter and digit groups, ignoring what separates them.
 *
 * People type these off a box lid, in every arrangement: `OSU ABR 19`,
 * `OSUABR19`, `osu-abr-19`. Accents are not folded — a box code has none, and
 * accepting `ÀBR` would be inventing tolerance for an input that cannot exist.
 */
export function segments(raw: string): Segment[] {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, ' ')
  const found: Segment[] = []

  for (const match of cleaned.matchAll(/([A-Z]+)|(\d+)/g)) {
    if (match[1]) found.push({ kind: 'letters', value: match[1] })
    else if (match[2]) found.push({ kind: 'digits', value: match[2] })
  }

  return found
}

export type YearReading = { value: number; century: 1900 | 2000; ambiguous: boolean }

/**
 * Two digits into a year, and the honest admission that two digits are two.
 *
 * The rule is the boring one: the most recent year that is not in the future.
 * `19` therefore reads 2019 rather than 2119.
 *
 * `ambiguous` is **always true for two digits**, and that is the point of the
 * flag. 2019 and 1919 are the same two characters, and nothing in the code
 * distinguishes them; the box-code system has run since 1985, so a fifty-year
 * ambiguity is not theoretical for anyone holding an old box. The parser picks
 * the likely reading and the interface says it picked one.
 *
 * Four digits are taken at face value — some non-Cuban makers print them — and
 * are not ambiguous, which is why the flag is not simply hard-coded.
 */
export function readYear(digits: string, today = new Date()): YearReading | null {
  if (!/^\d{2}$|^\d{4}$/.test(digits)) return null

  const currentYear = today.getUTCFullYear()

  if (digits.length === 4) {
    const value = Number(digits)
    if (value < 1900 || value > currentYear) return null
    return { value, century: value < 2000 ? 1900 : 2000, ambiguous: false }
  }

  const twoDigits = Number(digits)
  const thisCentury = 2000 + twoDigits
  const value = thisCentury <= currentYear ? thisCentury : 1900 + twoDigits

  return { value, century: value < 2000 ? 1900 : 2000, ambiguous: true }
}

export type CodeReading = {
  /** Every letter group, in the order they were typed. */
  letters: string[]
  /** The year, when exactly one digit group parsed as one. */
  year: YearReading | null
  /** Digit groups that are not a year — a batch number, usually. */
  otherDigits: string[]
  /** True when nothing at all could be made of the input. */
  empty: boolean
}

export function readCode(raw: string, today = new Date()): CodeReading {
  const parts = segments(raw)
  const letters = parts.filter((part) => part.kind === 'letters').map((part) => part.value)
  const digitGroups = parts.filter((part) => part.kind === 'digits').map((part) => part.value)

  let year: YearReading | null = null
  const otherDigits: string[] = []

  for (const digits of digitGroups) {
    const reading: YearReading | null = year === null ? readYear(digits, today) : null
    if (reading) year = reading
    else otherDigits.push(digits)
  }

  return {
    letters,
    year,
    otherDigits,
    empty: letters.length === 0 && digitGroups.length === 0,
  }
}
