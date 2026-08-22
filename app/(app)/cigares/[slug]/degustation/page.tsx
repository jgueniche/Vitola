import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { listAromaWheel } from '@/lib/aromas/queries'
import { todayInBrandZone } from '@/lib/format'
import { m } from '@/lib/i18n'
import { getCigarBySlug } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { TastingForm } from './tasting-form'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const cigar = await getCigarBySlug(slug)
  return { title: cigar ? `${m.notebook.tasting.eyebrow} — ${cigar.commercial_name}` : m.notebook.title }
}

/**
 * The structured tasting (§5.4), hung off the cigar it is about.
 *
 * Signed out sends to the sign-in page with `suite` set, rather than to a 404
 * or a bare refusal: the member arriving here clicked "faire une dégustation
 * complète" on a cigar page and should land back on this form, not at the top
 * of the site. `safeSuite()` in the middleware is what makes that parameter
 * safe to honour.
 *
 * The wheel is read here and passed down whole. Eighty-seven rows is one query
 * and about four kilobytes; fetching it from the client would mean an endpoint,
 * a loading state and a second way to be signed out.
 */
export default async function TastingPage({ params }: Params) {
  const { slug } = await params

  const [cigar, user] = await Promise.all([getCigarBySlug(slug), currentUser()])
  if (!cigar) notFound()

  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.cigarTasting(slug))}`)
  }

  const families = await listAromaWheel()

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <Link href={routes.cigar(slug)} className="eyebrow hover:text-accent-bright">
          {cigar.brands ? `${cigar.brands.name} · ` : ''}
          {cigar.commercial_name}
        </Link>
        <h1 className="font-display text-4xl leading-tight">
          {m.notebook.tasting.title.replace('{cigar}', cigar.commercial_name)}
        </h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">
          {m.notebook.tasting.lede}
        </p>
      </div>

      <Band variant="divider" />

      <TastingForm
        cigarId={cigar.id}
        slug={cigar.slug}
        families={families}
        today={todayInBrandZone()}
      />
    </main>
  )
}
