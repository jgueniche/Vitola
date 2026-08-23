import { m } from '@/lib/i18n'
import { JOURNAL_DONE } from '@/lib/journal/model'

/**
 * What a `?fait=…` means under `/journal/ecrire` — the mechanism of
 * `lib/social/confirmations.ts`: every status gesture navigates (publishing
 * swaps the banners under the very button that ran it), so the confirmation
 * arrives with the URL. Null on anything unrecognised: attacker controlled,
 * worst case no band.
 */
const SENTENCES: Record<string, string> = {
  [JOURNAL_DONE.saved]: m.journal.compose.saved,
  [JOURNAL_DONE.published]: m.journal.compose.published,
  [JOURNAL_DONE.unpublished]: m.journal.compose.unpublished,
  [JOURNAL_DONE.deleted]: m.journal.compose.deleted,
  [JOURNAL_DONE.linked]: m.journal.compose.saved,
  [JOURNAL_DONE.unlinked]: m.journal.compose.saved,
}

export function journalConfirmation(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw
  return code ? (SENTENCES[code] ?? null) : null
}
