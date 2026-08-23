import Link from 'next/link'

import { strengthLabel, type Strength } from '@/components/data/strength-meter'
import { wrapperShadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  EMPTY_FACETS,
  facetsToSearchParams,
  isFacetActive,
  STRENGTHS,
  toggleFacet,
  WRAPPER_SHADES,
  type Facets,
} from '@/lib/search/facets'
import { cn } from '@/lib/utils'

/**
 * Facets as links, not checkboxes.
 *
 * There is no client JavaScript on this panel at all: every option is an <a>
 * pointing at the URL that same page would have with the facet toggled. That
 * makes the whole search shareable, indexable when the gate allows it, and
 * usable before hydration — and it is why `app/CLAUDE.md` puts interface state
 * in the URL rather than in a store.
 *
 * `aria-current` carries the on state. The first version said `aria-pressed`,
 * which only exists on buttons — axe counts it critical on a link, and rightly:
 * an unsupported attribute is silence, not state. "Current" is also the truer
 * word for a filter the URL already holds.
 */

function href(facets: Facets): string {
  const params = facetsToSearchParams(facets)
  const query = params.toString()
  return query ? `${routes.cigars()}?${query}` : routes.cigars()
}

function FacetGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="eyebrow mb-2">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function FacetLink({
  label,
  active,
  target,
}: {
  label: string
  active: boolean
  target: string
}) {
  return (
    <Link
      href={target}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'border-rule rounded-[3px] border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-accent text-on-accent border-accent'
          : 'text-ink-muted hover:border-rule-strong hover:text-ink',
      )}
    >
      {label}
    </Link>
  )
}

export function FacetPanel({
  facets,
  countries,
}: {
  facets: Facets
  /** Origins present in the published set, so no facet leads to zero results. */
  countries: readonly string[]
}) {
  return (
    <aside className="flex flex-col gap-6" aria-label={m.referential.facets.title}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg">{m.referential.facets.title}</h2>
        {isFacetActive(facets) ? (
          <Link
            href={href({ ...EMPTY_FACETS, query: facets.query })}
            className="text-ink-muted hover:text-ink text-xs underline underline-offset-4"
          >
            {m.referential.facets.clearAll}
          </Link>
        ) : null}
      </div>

      <FacetGroup title={m.referential.facets.strength}>
        {STRENGTHS.map((strength) => (
          <FacetLink
            key={strength}
            label={strengthLabel(strength as Strength)}
            active={facets.strengths.includes(strength)}
            target={href(toggleFacet(facets, 'strengths', strength))}
          />
        ))}
      </FacetGroup>

      <FacetGroup title={m.referential.facets.shade}>
        {WRAPPER_SHADES.map((shade) => (
          <FacetLink
            key={shade}
            label={wrapperShadeLabel(shade as WrapperShade)}
            active={facets.shades.includes(shade)}
            target={href(toggleFacet(facets, 'shades', shade))}
          />
        ))}
      </FacetGroup>

      {countries.length > 0 ? (
        <FacetGroup title={m.referential.facets.country}>
          {countries.map((code) => (
            <FacetLink
              key={code}
              label={countryLabel(code)}
              active={facets.countries.includes(code)}
              target={href(toggleFacet(facets, 'countries', code))}
            />
          ))}
        </FacetGroup>
      ) : null}
    </aside>
  )
}
