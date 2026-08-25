import type { Metadata } from 'next'

import { HubPage } from '@/components/layout/hub'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

export const metadata: Metadata = { title: m.nav.circle.title }

const copy = m.nav

export default function CircleHubPage() {
  return (
    <HubPage
      eyebrow={copy.circle.label}
      title={copy.circle.title}
      lede={copy.circle.lede}
      cards={[
        { ...copy.cards.feed, href: routes.feed() },
        { ...copy.cards.members, href: routes.members() },
        { ...copy.cards.clubs, href: routes.clubs() },
        { ...copy.cards.events, href: routes.events() },
        { ...copy.cards.messages, href: routes.conversations() },
      ]}
    />
  )
}
