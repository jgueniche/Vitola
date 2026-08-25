import type { Metadata } from 'next'

import { HubPage } from '@/components/layout/hub'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

export const metadata: Metadata = { title: m.nav.mine.title }

const copy = m.nav

export default function MineHubPage() {
  return (
    <HubPage
      eyebrow={copy.mine.label}
      title={copy.mine.title}
      lede={copy.mine.lede}
      cards={[
        { ...copy.cards.notebook, href: routes.notebook() },
        { ...copy.cards.humidor, href: routes.humidor() },
        { ...copy.cards.statistics, href: routes.statistics() },
      ]}
    />
  )
}
