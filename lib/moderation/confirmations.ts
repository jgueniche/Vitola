import { m } from '@/lib/i18n'
import { MOD_DONE } from '@/lib/moderation/model'

/**
 * What a `?fait=…` means under /moderation — the mechanism of
 * `lib/social/confirmations.ts`, for the reason of always: deciding a case
 * removes it from the open queue, so the form that did it is unmounted in the
 * same render and the confirmation has to travel with the navigation.
 *
 * Returns null on anything unrecognised: the value is attacker controlled and
 * the worst a bad one may do is render no band.
 */
const SENTENCES: Record<string, string> = {
  [MOD_DONE.acknowledged]: m.moderation.desk.done.acknowledged,
  [MOD_DONE.decided]: m.moderation.desk.done.decided,
}

export function moderationConfirmation(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw
  return code ? (SENTENCES[code] ?? null) : null
}
