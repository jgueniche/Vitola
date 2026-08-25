import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { getCigarBySlug } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { currentValues, listLineOptions, listVitolaOptions } from '@/lib/wiki/queries'

import { ProposeForm, type Current } from './propose-form'

export const metadata: Metadata = { title: m.contributions.proposeTitle }

const copy = m.contributions

type Params = { params: Promise<{ slug: string }> }

/**
 * Proposer une correction — F3, hanging off the sheet it corrects.
 *
 * Signed out sends to the sign-in page with `suite`, like the tasting form:
 * somebody who clicked "proposer une correction" should land back on the form
 * rather than at the top of the site.
 *
 * The values come from `currentValues()` and not from `getCigarBySlug()`, and
 * the difference matters: the sheet reader embeds the vitola as an object,
 * while a diff is keyed on `vitola_id`. A form built from the embed could
 * render the vitola and not propose it.
 */
export default async function ProposePage({ params }: Params) {
  const { slug } = await params

  const [cigar, user] = await Promise.all([getCigarBySlug(slug), currentUser()])
  if (!cigar) notFound()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.cigarPropose(slug))}`)
  }

  const [values, vitolas, lines, open] = await Promise.all([
    currentValues(cigar.id),
    listVitolaOptions(),
    /* Published lines of this brand only — ADR 0009: the dropdown is the first
       of the two guards nothing in the schema holds. */
    listLineOptions(cigar.brand_id),
    /* `wiki_contributions_open` exists to open this, so this is what reads it.
       Closed is the fallback: a flag that opens a door must never be opened by
       a database hiccup. */
    isFeatureEnabled('wiki_contributions_open'),
  ])
  if (!values) notFound()

  const current: Current = {
    commercial_name: String(values.commercial_name ?? ''),
    vitola_id: (values.vitola_id as string | null) ?? null,
    line_id: (values.line_id as string | null) ?? null,
    origin_country: (values.origin_country as string | null) ?? null,
    wrapper_origin: (values.wrapper_origin as string | null) ?? null,
    binder_origin: (values.binder_origin as string | null) ?? null,
    filler_origins: (values.filler_origins as string[] | null) ?? [],
    wrapper_shade: (values.wrapper_shade as string | null) ?? null,
    strength: (values.strength as string | null) ?? null,
    release_type: String(values.release_type ?? 'regular'),
    release_year: (values.release_year as number | null) ?? null,
    discontinued_year: (values.discontinued_year as number | null) ?? null,
  }

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Link href={routes.cigar(slug)} className="eyebrow hover:text-accent-bright w-fit">
          {copy.backToSheet}
        </Link>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.proposeTitle}</h1>
        <p className="text-ink-muted text-sm">
          {copy.proposeFor} : {cigar.brands?.name ? `${cigar.brands.name} · ` : ''}
          {cigar.commercial_name}
        </p>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.proposeLede}</p>
      </div>

      <Band variant="divider" />

      {open ? (
        <ProposeForm cigarId={cigar.id} slug={slug} current={current} vitolas={vitolas} lines={lines} />
      ) : (
        <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border px-4 py-4">
          <p className="eyebrow">{copy.closedTitle}</p>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.closedBody}</p>
        </div>
      )}

      <div className="border-rule rounded-[3px] border border-dashed px-4 py-4">
        <p className="eyebrow">{copy.newSheetTitle}</p>
        <p className="text-ink-muted measure mt-2 text-sm leading-relaxed">{copy.newSheetBody}</p>
      </div>
    </main>
  )
}
