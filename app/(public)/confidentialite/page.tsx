import type { Metadata } from 'next'

import { DocumentPage } from '@/components/layout/document-page'
import { m } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Politique de confidentialité' }

export default function Page() {
  return (
    <DocumentPage eyebrow="Informations légales" title={m.legal.privacyTitle}>
      <p>{m.legal.placeholder}</p>
    </DocumentPage>
  )
}
