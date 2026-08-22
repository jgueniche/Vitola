import { BRAND } from '@/lib/brand'
import { REVIEW_SCOPES, type ReviewVisibility } from './model'

/**
 * The autosaved draft of a tasting in progress.
 *
 * **Why the draft is not a row.** `reviews` has no `status` column, and
 * `reviews_tasting_has_structure` refuses a tasting whose `scores` is empty — so
 * a tasting cannot even be inserted until it has been started properly, and a
 * half-filled form has nowhere to live in the database. Adding a status column
 * to hold typing-in-progress would put unfinished text into a table the GDPR
 * export walks and the moderation queue can point at, for no gain: nobody but
 * the author can read a draft, and the author is holding the device it is on.
 *
 * So it lives in `localStorage`, and the interface says so in as many words —
 * "elle ne quitte pas votre navigateur". That is an honest promise and a
 * cheap one to keep. It also means a draft does not follow one from a phone to
 * a laptop, which is a real limitation and is written down rather than hidden.
 *
 * Everything here is pure: `window` is never touched in this file. The
 * component reads and writes the string; this decides what a valid draft is.
 */

export type TastingDraft = {
  /**
   * When this draft was first opened, not when it was last saved.
   *
   * Stable on purpose: the form is keyed on it so that restoring remounts the
   * fields exactly once. Were it a save timestamp, every keystroke would
   * remount the form and take the cursor with it.
   */
  startedAt: string
  /** Plain form fields, by input name. */
  fields: Record<string, string>
  aromaTags: number[]
  visibility: ReviewVisibility
  isBlind: boolean
}

/** One draft per cigar: two tastings of different cigars do not overwrite. */
export function draftStorageKey(slug: string): string {
  return `${BRAND.slug}:tasting-draft:${slug}`
}

/** Field names never worth keeping — routing, not content. */
const IGNORED_FIELDS = new Set(['cigarId', 'slug', 'aromaTags', 'visibility', 'isBlind', '$ACTION_ID'])

/**
 * Builds a draft from a live form.
 *
 * Takes the iterable of entries rather than the `FormData` itself so this stays
 * testable in Node without a DOM: `[...formData.entries()]` at the call site.
 */
export function draftFromEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
  startedAt: string,
): TastingDraft {
  const fields: Record<string, string> = {}
  const aromaTags: number[] = []
  let visibility: ReviewVisibility = 'private'
  let isBlind = false

  for (const [name, value] of entries) {
    if (typeof value !== 'string') continue

    if (name === 'aromaTags') {
      const id = Number(value)
      if (Number.isInteger(id)) aromaTags.push(id)
      continue
    }
    if (name === 'visibility') {
      if (isVisibility(value)) visibility = value
      continue
    }
    if (name === 'isBlind') {
      isBlind = value === 'on' || value === 'true'
      continue
    }
    // A Server Action form carries hidden React fields; none of them is content.
    if (IGNORED_FIELDS.has(name) || name.startsWith('$ACTION')) continue

    if (value !== '') fields[name] = value
  }

  return { startedAt, fields, aromaTags, visibility, isBlind }
}

/** True once a draft holds anything a member would be sorry to retype. */
export function draftHasContent(draft: TastingDraft): boolean {
  return (
    Object.keys(draft.fields).length > 0 ||
    draft.aromaTags.length > 0 ||
    draft.isBlind ||
    draft.visibility !== 'private'
  )
}

/**
 * Parses what came out of storage, and refuses anything it does not recognise.
 *
 * `localStorage` is writable by anything running on the origin and survives
 * deploys, so a draft may be a stale shape from a previous version, or simply
 * corrupt. Every field is checked; one bad key discards the draft rather than
 * restoring half of it, because a form silently missing three fields is worse
 * than a form that starts empty.
 */
export function parseDraft(raw: string | null): TastingDraft | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Partial<TastingDraft>
    if (typeof candidate.startedAt !== 'string') return null
    if (!candidate.fields || typeof candidate.fields !== 'object') return null

    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(candidate.fields)) {
      if (typeof value === 'string') fields[key] = value
    }

    const aromaTags = Array.isArray(candidate.aromaTags)
      ? candidate.aromaTags.filter((id): id is number => Number.isInteger(id))
      : []

    return {
      startedAt: candidate.startedAt,
      fields,
      aromaTags,
      visibility: isVisibility(candidate.visibility) ? candidate.visibility : 'private',
      isBlind: candidate.isBlind === true,
    }
  } catch {
    return null
  }
}

function isVisibility(value: unknown): value is ReviewVisibility {
  return typeof value === 'string' && (REVIEW_SCOPES as readonly string[]).includes(value)
}

/**
 * Minutes from a stopwatch reading, rounded to the nearest whole minute and
 * never to zero.
 *
 * `reviews_duration` refuses 0 and accepts 1 to 600, so a tasting stopped after
 * forty seconds must round *up* — rounding to zero would produce a value the
 * database rejects out of a timer the interface offered. Above the ceiling the
 * value is clamped: a timer left running overnight should not refuse the whole
 * form on save.
 */
export function minutesFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.min(600, Math.max(1, Math.round(seconds / 60)))
}
