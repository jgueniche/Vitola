import type { Metadata } from 'next'

import { HubPage, type HubCard } from '@/components/layout/hub'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { venuesFlag } from '@/lib/venues/queries'

export const metadata: Metadata = { title: m.nav.around.title }

const copy = m.nav

/**
 * The one hub that reads flags: the venues promise of Q6 used to live in the
 * header — read on EVERY page — and now lives here, on the only page that
 * makes it. A legal restriction that closes the directory removes the card in
 * the same UPDATE, and the header stops paying a query per render site-wide.
 * The shop card follows the same regime (ADR 0016): `shop_enabled` is the
 * owner's commercial-opening lever, and a card toward a 404 is the bug the
 * P0 nav already paid.
 */
export default async function AroundHubPage() {
  const [venues, shopOpen] = await Promise.all([venuesFlag(), isFeatureEnabled('shop_enabled')])

  const cards: HubCard[] = [
    ...(venues.enabled ? [{ ...copy.cards.venues, href: routes.venues() }] : []),
    ...(shopOpen ? [{ ...copy.cards.shop, href: routes.shop() }] : []),
    { ...copy.cards.journal, href: routes.journal() },
  ]

  return (
    <HubPage
      eyebrow={copy.around.label}
      title={copy.around.title}
      lede={copy.around.lede}
      cards={cards}
    />
  )
}
