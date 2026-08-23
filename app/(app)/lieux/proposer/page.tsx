import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { venuesFlag } from '@/lib/venues/queries'

import { ProposeVenueForm } from './propose-form'

export const metadata: Metadata = { title: m.venues.propose.title }

const copy = m.venues.propose

/**
 * Proposer un lieu (ADR 0011, D2).
 *
 * A member's gesture — the sign-in redirect is the same as the notebook's.
 * What the form offers is what the flag offers: a type removed from the Q6
 * payload disappears from here too, so a legal restriction closes the entrance
 * with the same UPDATE that closes the directory.
 */
export default async function ProposeVenuePage() {
  const flag = await venuesFlag()
  if (!flag.enabled) notFound()

  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.venuePropose())}`)
  }

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <Band variant="divider" />

      <ProposeVenueForm offeredTypes={flag.types} />
    </main>
  )
}
