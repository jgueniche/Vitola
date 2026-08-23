import { m } from '@/lib/i18n'
import { CLUB_DONE, EVENT_DONE, MESSAGE_DONE } from '@/lib/social/groups'
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

/**
 * The same mechanism for the clubs, the agenda and the messaging.
 *
 * One table per section rather than one big one: `retire` means "membre
 * retiré" under a club and "réponse retirée" under an event, and a shared table
 * would have had to invent two codes to keep them apart. A code is only ever
 * read by the page that emits it.
 */
const CLUB_SENTENCES: Record<string, string> = {
  [CLUB_DONE.created]: m.clubs.done.created,
  [CLUB_DONE.joined]: m.clubs.done.joined,
  [CLUB_DONE.left]: m.clubs.done.left,
  [CLUB_DONE.removed]: m.clubs.done.removed,
  [CLUB_DONE.deleted]: m.clubs.done.deleted,
}

const EVENT_SENTENCES: Record<string, string> = {
  [EVENT_DONE.created]: m.events.done.created,
  [EVENT_DONE.answered]: m.events.done.answered,
  [EVENT_DONE.withdrawn]: m.events.done.withdrawn,
  [EVENT_DONE.cancelled]: m.events.done.cancelled,
}

const MESSAGE_SENTENCES: Record<string, string> = {
  [MESSAGE_DONE.sent]: m.messaging.done.sent,
  [MESSAGE_DONE.read]: m.messaging.done.read,
  [MESSAGE_DONE.deleted]: m.messaging.done.deleted,
}

function lookup(table: Record<string, string>, raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw
  return code ? (table[code] ?? null) : null
}

export function clubConfirmation(raw: string | string[] | undefined): string | null {
  return lookup(CLUB_SENTENCES, raw)
}

export function eventConfirmation(raw: string | string[] | undefined): string | null {
  return lookup(EVENT_SENTENCES, raw)
}

export function messagingConfirmation(raw: string | string[] | undefined): string | null {
  return lookup(MESSAGE_SENTENCES, raw)
}
