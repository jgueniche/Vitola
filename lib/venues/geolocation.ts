/**
 * What we ask the browser for a position, and what we refuse.
 *
 * Pure, like everything in `lib/`: no DOM, no navigator, no React. The two
 * callers — the venue list's « Me localiser » and the proposal form's
 * « Utiliser ma position » — read the same numbers, because the QA session of
 * 12 septembre 2026 found the list wrong and there was no reason to believe
 * the form was right.
 *
 * **What went wrong.** « On était à Marnes-la-Coquette et il nous sortait des
 * lieux dans Paris 13 » — fourteen kilometres out. Not drift: a different
 * source. `getCurrentPosition` with `enableHighAccuracy` unset is free to
 * answer from the cheapest signal available, and on a desk without GPS that is
 * the IP address, which resolves to an operator's point of presence. The
 * options asked for a cheap answer and got one.
 *
 * **The part that is not an option.** Every fix carries `coords.accuracy`: the
 * radius, in metres, of the 68 % confidence circle. An IP-derived fix reports
 * something like 15 000 and a GPS fix something like 20, and both arrive
 * through the same success callback. Reading it is the difference between
 * knowing where someone is and guessing.
 */
export const GEOLOCATION = {
  /**
   * No cached fix at all. A minute-old position is a different street in a car
   * and, on a laptop, whatever the last site to ask happened to get.
   */
  maximumAgeMs: 0,

  /**
   * Longer than the 10 s it was, because a real fix is slower than a lookup:
   * a cold GPS needs to see satellites, and refusing at ten seconds is how a
   * device that would have answered accurately answers not at all.
   */
  timeoutMs: 20_000,

  /**
   * The floor of usable precision, in metres.
   *
   * Two kilometres, and the number comes from what the search is for: the
   * smallest radius `/lieux` offers is 1 km (`VENUE_SEARCH.radiusMinKm`), so a
   * fix vaguer than twice that cannot honestly centre even the widest circle
   * anyone would call "near me". Above it we refuse and say so, rather than
   * searching around a telephone exchange and letting the reader conclude
   * there is nothing near them.
   */
  maxAccuracyMetres: 2_000,
} as const

/**
 * Whether a fix is too vague to search from.
 *
 * A missing accuracy is treated as coarse, and that is deliberate: the field is
 * required by the spec, so a browser that omits it is one whose position we
 * have no way to judge. Refusing asks the person to try again; accepting puts
 * them somewhere they are not.
 */
export function isCoarse(accuracyMetres: number | null | undefined): boolean {
  if (typeof accuracyMetres !== 'number' || Number.isNaN(accuracyMetres)) return true
  return accuracyMetres > GEOLOCATION.maxAccuracyMetres
}
