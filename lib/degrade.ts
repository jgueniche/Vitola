/**
 * What a page does with a read that did not come back (ADR 0020).
 *
 * One rule, for the whole site: **what is the subject of the page fails
 * frankly; what accompanies it renders empty and says so.** The subject is
 * awaited bare and throws — nothing here touches it. The accompaniment is
 * wrapped in `accessory()`, which turns a failure into a third state the
 * compiler forces the page to unpack and the screen forces it to name.
 *
 * ## Why the fallback is never the empty value
 *
 * `catch { return [] }` is the shortest way to write this file, and it is the
 * one thing it may not do. `lib/CLAUDE.md` forbids doubling an RLS policy in
 * TypeScript, and an empty array IS that doubling: `reviews`, `posts`,
 * `venues` and `products` all return zero rows legitimately — 937 cigar sheets
 * out of 940 have no public rating — so « rien » from a catch is
 * indistinguishable from « rien » from a policy. The reader would be told
 * "nothing here" by a site that never asked.
 *
 * **A failure must be distinguishable from a refusal.** That is the whole
 * design, and it is why `Accessory<T>` has no value on its failing branch:
 * there is nothing to accidentally read.
 *
 * ## What this is NOT
 *
 * Not a retry, not a cache, not a timeout. A retry doubles the load on a
 * provider that is already failing; a cache put in front of a degraded API
 * hides the next outage as well as this one (ADR 0020, option D). This
 * catches, says so once in the log, and hands the page a value it cannot
 * mistake for data.
 */

/** A read that may not have come back. No value on the failing branch, by design. */
export type Accessory<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

/**
 * Wrap a read the page can do without.
 *
 * ```ts
 * const [sheet, stats] = await Promise.all([
 *   getCigarBySlug(slug),        // the subject — throws, and must
 *   accessory(getCigarStats(id)) // the accompaniment — never throws
 * ])
 * ```
 *
 * Takes the promise rather than a thunk, so it reads as one word in front of
 * the call it qualifies and composes inside `Promise.all` — where its point is
 * sharpest: a wrapped read can no longer reject the whole batch, so the batch
 * rejects for the subject and nothing else.
 *
 * The rejection is handled in the same tick the promise is passed in, so there
 * is no window for an unhandled-rejection warning.
 */
export async function accessory<T>(read: Promise<T>): Promise<Accessory<T>> {
  try {
    return { ok: true, value: await read }
  } catch (error) {
    /* Once, at error level, with the message the query built — « Could not
       read the origin facet: Bad Gateway » names both the read and the cause.
       A degradation nobody can see in a log is a degradation nobody fixes. */
    console.error('[accessory] a non-essential read failed:', error)
    return { ok: false }
  }
}

/**
 * The value, or a stand-in chosen at the CALL SITE — for the cases where the
 * page renders nothing at all rather than a notice.
 *
 * Deliberately awkward to reach for, and deliberately not defaulted: the
 * stand-in has to be typed out where it is chosen, so that choosing « empty »
 * is a visible decision rather than the path of least resistance. Use it only
 * where an absent block is honest on its own — a decorative count, a badge —
 * and `Unavailable` everywhere a reader could mistake absence for emptiness.
 */
export function orElse<T>(result: Accessory<T>, standIn: T): T {
  return result.ok ? result.value : standIn
}
