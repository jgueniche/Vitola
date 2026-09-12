import { permanentRedirect } from 'next/navigation'

import { routes } from '@/lib/routes'

/**
 * « Supprimer le "autour" » (QA du 12 septembre 2026).
 *
 * The hub held three cards: the venues, the shop and the journal. The first
 * two are now nav entries of their own — the partners and the shop are two of
 * the three sections a signed-out visitor is offered — and the journal is
 * reached from the footer, where the public part of the site belongs.
 *
 * It was also the one hub that read feature flags, which is why deleting it
 * costs nothing: `venues_enabled` and `shop_enabled` are still the kill
 * switches, enforced by the sections themselves with a 404.
 */
export default function AroundHubPage() {
  permanentRedirect(routes.venues())
}
