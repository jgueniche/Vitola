import type { Metadata } from 'next'

import { HubPage, type HubCard } from '@/components/layout/hub'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { venuesFlag } from '@/lib/venues/queries'

export const metadata: Metadata = { title: m.nav.around.title }

const copy = m.nav

/**
 * The one hub that reads a flag: the venues promise of Q6 used to live in the
 * header — read on EVERY page — and now lives here, on the only page that
 * makes it. A legal restriction that closes the directory removes the card in
 * the same UPDATE, and the header stops paying a query per render site-wide.
 */
export default async function AroundHubPage() {
  const venues = await venuesFlag()

  const cards: HubCard[] = [
    ...(venues.enabled ? [{ ...copy.cards.venues, href: routes.venues() }] : []),
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
