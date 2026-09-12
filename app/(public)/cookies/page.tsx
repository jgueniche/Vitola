import type { Metadata } from 'next'

import { DocumentPage } from '@/components/layout/document-page'
import { m } from '@/lib/i18n'

export const metadata: Metadata = { title: m.legal.cookiesTitle }

export default function Page() {
  return (
    <DocumentPage eyebrow={m.legal.eyebrow} title={m.legal.cookiesTitle}>
      <p>{m.legal.placeholder}</p>
    </DocumentPage>
  )
}
