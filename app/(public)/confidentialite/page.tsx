import type { Metadata } from 'next'
import Link from 'next/link'

import { DocumentPage } from '@/components/layout/document-page'
import { m } from '@/lib/i18n'
import { PERSONAL_DATA_SOURCES } from '@/lib/compliance/gdpr'
import { routes } from '@/lib/routes'

const copy = m.privacyPolicy

export const metadata: Metadata = { title: copy.title }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-display text-ink text-display-sm mt-8">{title}</h2>
      {children}
    </>
  )
}

/**
 * La politique de confidentialité, écrite depuis ce que la base enregistre.
 *
 * It was a placeholder until P3, and the gap was named in the handoff three
 * sessions running: the notebook shipped, then the cave, then the settings
 * screen with its consent register — and this page still described none of
 * them. A page that links to a policy which does not mention what the product
 * records is worse than no link.
 *
 * Two things make it more than prose.
 *
 * It counts its own sources. `PERSONAL_DATA_SOURCES` is the list the GDPR export
 * is built from, and `tests/compliance/gdpr-inventory.test.ts` fails when a
 * column pointing at `auth.users` is missing from it — that test broke on P3 and
 * on the cave before it, which is how the list stayed true. Rendering the count
 * here means the page cannot quietly fall behind the schema: the number moves
 * on its own, and a reader can check it against the export they just downloaded.
 *
 * And it says the awkward things rather than the reassuring ones. Removing a
 * recipient closes future reading and does not undo a past read — ADR 0004
 * requires that sentence and forbids promising more. A free follow means the
 * audience of an already-written entry can grow. Two settings are displays
 * rather than locks. None of that reads well; all of it is true, and a privacy
 * policy that is pleasant and wrong is the failure mode this one avoids.
 */
export default function Page() {
  const sourceCount = PERSONAL_DATA_SOURCES.length

  return (
    <DocumentPage eyebrow={copy.eyebrow} title={copy.title}>
      <p className="border-caution text-ink-muted border-l-2 pl-4">{copy.draft}</p>

      <Section title={copy.whoTitle}>
        <p>{copy.whoBody}</p>
      </Section>

      <Section title={copy.sensitiveTitle}>
        <p>{copy.sensitiveBody}</p>
      </Section>

      <Section title={copy.notebookTitle}>
        <p>{copy.notebookBody}</p>
        <p>{copy.notebookScope}</p>
        <p>{copy.notebookRevoke}</p>
      </Section>

      <Section title={copy.humidorTitle}>
        <p>{copy.humidorBody}</p>
        <p>{copy.humidorScope}</p>
      </Section>

      <Section title={copy.socialTitle}>
        <p>{copy.socialBody}</p>
        <p>{copy.socialScope}</p>
        <p>{copy.socialDirectory}</p>
      </Section>

      <Section title={copy.referentialTitle}>
        <p>{copy.referentialBody}</p>
      </Section>

      <Section title={copy.legalTitle}>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>{copy.legalContract}</li>
          <li>{copy.legalObligation}</li>
          <li>{copy.legalInterest}</li>
          <li>{copy.legalConsent}</li>
        </ul>
        <p>{copy.legalArticle9}</p>
      </Section>

      <Section title={copy.durationTitle}>
        <p>{copy.durationBody}</p>
      </Section>

      <Section title={copy.rightsTitle}>
        <p>{copy.rightsBody}</p>
        <p>{copy.rightsExport.replace('{count}', String(sourceCount))}</p>
        <p>
          <Link
            href={routes.settings()}
            className="text-accent-bright underline underline-offset-4"
          >
            {m.settings.title}
          </Link>
          {' · '}
          <Link
            href={routes.legalNotice()}
            className="text-accent-bright underline underline-offset-4"
          >
            {m.legal.noticeTitle}
          </Link>
          {' · '}
          <Link href={routes.cookies()} className="text-accent-bright underline underline-offset-4">
            {m.legal.cookiesTitle}
          </Link>
        </p>
      </Section>

      <Section title={copy.changesTitle}>
        <p>{copy.changesBody}</p>
      </Section>
    </DocumentPage>
  )
}
