import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { StrengthMeter, strengthLabel, type Strength } from '@/components/data/strength-meter'
import { EmptyState } from '@/components/layout/empty-state'
import { MineTabs } from '@/components/layout/mine-tabs'
import { SectionHead } from '@/components/layout/section-head'
import { buttonClass } from '@/components/ui/button'
import { aromaLabels } from '@/lib/reviews/queries'
import { ambianceOf, readSuggestions, type Ambiance } from '@/lib/reviews/suggestions'
import { formatDimensions } from '@/lib/format'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: m.suggestions.title }

const copy = m.suggestions

const AMBIANCE: Record<Ambiance, string> = {
  court: copy.ambianceCourt,
  moyen: copy.ambianceMoyen,
  long: copy.ambianceLong,
}

/**
 * « Cinq bagues à essayer » — the feature the QA session of 12 septembre 2026
 * asked for: « il prend les 5 bagues avec une moyenne de ce que le client a
 * fumé et il fait des propositions, avec ce qu'il a pas fumé, l'ambiance etc. »
 *
 * One RPC call and one label lookup, and nothing else. The ranking is
 * `public.suggest_cigars()` (migration 0032, SECURITY INVOKER) because the
 * profile is built from the notebook, which four SELECT policies protect —
 * this page could not compute it without either shipping 940 sheets to the
 * server or claiming a privilege it has no business having.
 *
 * Rows, not cards. Five suggestions with a name, a maison, the measures, the
 * moment and why — that is a list, and the design system says a list is lines
 * between hairlines. A card per suggestion would have been five boxes in a
 * column, which is what the 6 septembre audit spent a day undoing.
 */
export default async function SuggestionsPage() {
  const user = await currentUser()
  if (!user) redirect(routes.signIn())

  const suggestions = await readSuggestions(5)
  const labels = await aromaLabels(suggestions.flatMap((item) => item.aroma_tags))

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <MineTabs current="suggestions" />

      <SectionHead eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />

      {suggestions.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Link href={routes.cigars()} className={buttonClass({ variant: 'secondary' })}>
              {m.nav.cigars.label}
            </Link>
          }
        />
      ) : (
        <ul className="border-rule flex flex-col border-t">
          {suggestions.map((item) => {
            const ambiance = ambianceOf(item.length_mm, item.ring_gauge)
            const strength = (item.strength as Strength | null) ?? null
            const aromas = item.aroma_tags
              .map((id) => labels.get(id))
              .filter((label): label is string => label !== undefined)

            return (
              <li key={item.cigar_id} className="border-rule relative border-b py-4">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="text-base leading-tight font-medium">
                      <Link
                        href={routes.cigar(item.slug)}
                        className="hover:text-accent-bright after:absolute after:inset-0 after:content-['']"
                      >
                        {item.commercial_name}
                      </Link>
                    </h2>
                    {item.brand_name ? (
                      <p className="eyebrow text-ink-muted">{item.brand_name}</p>
                    ) : null}
                  </div>

                  {/* The measures that exist, on one line. Nothing where they
                      do not: an empty field is a task, not information. */}
                  {item.vitola_name || strength ? (
                    <p className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {item.vitola_name ? <span>{item.vitola_name}</span> : null}
                      {item.ring_gauge !== null && item.length_mm !== null ? (
                        <span className="font-mono tracking-wide">
                          {formatDimensions(item.ring_gauge, item.length_mm)}
                        </span>
                      ) : null}
                      {strength ? (
                        <span className="inline-flex items-center gap-1.5">
                          <StrengthMeter strength={strength} showLabel={false} />
                          {strengthLabel(strength)}
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {aromas.length > 0 ? (
                    <p className="text-ink-faint text-xs">{aromas.join(' · ')}</p>
                  ) : null}

                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
                    {/* Why this one, said in the terms the function ranked it
                        on — never "recommandé pour vous", which explains
                        nothing and claims everything. */}
                    <span className="text-accent">
                      {item.reason === 'aroma'
                        ? item.shared_aromas === 1
                          ? copy.reasonAromaOne
                          : copy.reasonAromaMany.replace('{count}', String(item.shared_aromas))
                        : item.reason === 'profile'
                          ? copy.reasonProfile
                          : copy.reasonPopular}
                    </span>
                    <span className="text-ink-muted">
                      {ambiance ? AMBIANCE[ambiance] : copy.ambianceUnknown}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* How the list is made, once, at the bottom — not five times over five
          rows. A ranking that will not say what it ranked on is a ranking one
          has no reason to trust. */}
      <section aria-labelledby="comment" className="flex flex-col gap-2">
        <h2 id="comment" className="label text-ink">
          {copy.howTitle}
        </h2>
        <p className="text-ink-faint measure text-xs leading-relaxed">{copy.howBody}</p>
      </section>
    </main>
  )
}
