import type { Metadata } from 'next'

import { HubPage } from '@/components/layout/hub'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

export const metadata: Metadata = { title: m.nav.discover.title }

const copy = m.nav

export default function DiscoverHubPage() {
  return (
    <HubPage
      eyebrow={copy.discover.label}
      title={copy.discover.title}
      lede={copy.discover.lede}
      cards={[
        { ...copy.cards.cigars, href: routes.cigars() },
        { ...copy.cards.brands, href: routes.brands() },
        { ...copy.cards.vitolas, href: routes.vitolas() },
        { ...copy.cards.aromas, href: routes.aromas() },
        { ...copy.cards.boxCodes, href: routes.boxCodes() },
        { ...copy.cards.contributions, href: routes.contributions() },
      ]}
    />
  )
}
