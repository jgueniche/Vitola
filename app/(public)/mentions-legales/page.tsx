import type { Metadata } from 'next'

import { DocumentPage } from '@/components/layout/document-page'
import { DSA_CONTACT_EMAIL } from '@/lib/compliance/dsa'
import { m } from '@/lib/i18n'
import { reportSlaHours } from '@/lib/moderation/queries'

export const metadata: Metadata = { title: 'Mentions légales' }

/**
 * ADR 0005 makes this page part of the reporting mechanism, not a document
 * beside it: the DSA asks for a notice mechanism, a queue and a **published**
 * deadline, and this is where the third one is published.
 *
 * The number is read from `feature_flags.dsa_report_sla_hours` rather than
 * written here, because it engages us and must be changeable without a deploy —
 * the migration that created the flag says so in as many words. `reportSlaHours`
 * falls back to the pinned constant rather than throwing, for the reason it
 * explains: a legal page that fails to render is a page that has stopped making
 * its commitment.
 */
export default async function Page() {
  const hours = await reportSlaHours()

  return (
    <DocumentPage eyebrow="Informations légales" title={m.legal.noticeTitle}>
      <p>{m.legal.placeholder}</p>

      <h2 className="font-display text-ink mt-6 text-2xl">{m.legal.dsaTitle}</h2>
      <p>{m.legal.dsaMechanism}</p>
      <p>{m.legal.dsaDeadline.replace('{hours}', String(hours))}</p>

      {DSA_CONTACT_EMAIL ? (
        <p>
          {m.legal.dsaContactLabel} :{' '}
          <a
            href={`mailto:${DSA_CONTACT_EMAIL}`}
            className="text-accent-bright underline underline-offset-4"
          >
            {DSA_CONTACT_EMAIL}
          </a>
        </p>
      ) : (
        <p>{m.legal.dsaContactPending}</p>
      )}
    </DocumentPage>
  )
}
