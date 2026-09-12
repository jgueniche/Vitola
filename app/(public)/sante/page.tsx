import type { Metadata } from 'next'

import { DocumentPage } from '@/components/layout/document-page'
import { m } from '@/lib/i18n'

export const metadata: Metadata = { title: m.health.title }

export default function HealthPage() {
  return (
    <DocumentPage eyebrow={m.health.eyebrow} title={m.health.title}>
      <p>{m.health.lede}</p>
      <h2 className="text-ink font-display text-display-sm mt-4">{m.health.helpTitle}</h2>
      <p>{m.health.helpBody}</p>
    </DocumentPage>
  )
}
