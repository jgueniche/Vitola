import { m } from '@/lib/i18n'
import { PERSON_DONE } from '@/lib/social/model'

/**
 * What a `?fait=…` in the URL means, in French, for the two pages that receive
 * one — a member's profile and the settings screen.
 *
 * It exists so those two cannot disagree. Three of the five relation gestures
 * replace the subtree they were clicked in, so their confirmation has to arrive
 * with the navigation rather than as returned state; the codes are declared
 * next to the actions that emit them, and the sentences here.
 *
 * Returns null on anything unrecognised, including nothing at all: the value is
 * attacker controlled and the worst a bad one may do is render no band.
 */
const SENTENCES: Record<string, string> = {
  [PERSON_DONE.followed]: m.members.followed,
  [PERSON_DONE.unfollowed]: m.members.unfollowed,
  [PERSON_DONE.removedFollower]: m.members.removedFollower,
  [PERSON_DONE.blocked]: m.members.blocked,
  [PERSON_DONE.unblocked]: m.members.unblocked,
}

export function relationConfirmation(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw
  return code ? (SENTENCES[code] ?? null) : null
}
