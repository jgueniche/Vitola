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

/**
 * The exceptions Next.js throws as CONTROL FLOW, which must never be caught.
 *
 * Found by reading a build log, not by reasoning: the first version of this
 * file printed
 *
 *   [accessory] a non-essential read failed: Error: Dynamic server usage:
 *   Route /cigares couldn't be rendered statically because it used `cookies`
 *
 * fourteen times during `pnpm build`. That is not a failure — it is how Next
 * signals « this route must be dynamic », and swallowing it tells the builder
 * the opposite. Nothing flipped to static that day, and only by luck: every
 * page still had at least one BARE read to re-throw the signal. A page whose
 * reads were all wrapped would have been prerendered with « indisponible »
 * baked into it, permanently, for everyone.
 *
 * `redirect()` and `notFound()` are the same mechanism. A wrapped read that
 * called either would have had its navigation silently cancelled.
 *
 * Matched on `digest`/`code` rather than by importing Next's internals: the
 * values are part of the RSC wire contract, the import paths are not.
 */
const NEXT_CONTROL_FLOW = [
  'DYNAMIC_SERVER_USAGE', // a dynamic API used during static generation
  'NEXT_REDIRECT', // redirect() — carries its target after a ';'
  'NEXT_NOT_FOUND', // notFound(), before Next 15
  'NEXT_HTTP_ERROR_FALLBACK', // notFound()/forbidden()/unauthorized(), Next 15+
  'NEXT_STATIC_GEN_BAILOUT',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
]

function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const marker = (error as { digest?: unknown }).digest ?? (error as { code?: unknown }).code
  if (typeof marker !== 'string') return false
  return NEXT_CONTROL_FLOW.some((known) => marker === known || marker.startsWith(`${known};`))
}

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
    /* Next's control flow is not a failed read. Re-thrown before anything
       else, because catching it breaks the framework rather than the page. */
    if (isNextControlFlow(error)) throw error

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
