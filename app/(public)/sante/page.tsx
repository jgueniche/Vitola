import type { Metadata } from 'next'

import { DocumentPage } from '@/components/layout/document-page'
import { m } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Tabac et santé' }

export default function HealthPage() {
  return (
    <DocumentPage eyebrow="Information" title={m.health.title}>
      <p>{m.health.lede}</p>
      <h2 className="text-ink font-display mt-4 text-2xl">{m.health.helpTitle}</h2>
      <p>{m.health.helpBody}</p>
    </DocumentPage>
  )
}
