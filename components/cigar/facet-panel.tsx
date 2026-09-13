import { ChevronDown } from 'lucide-react'
import Link from 'next/link'

import { strengthLabel, type Strength } from '@/components/data/strength-meter'
import { wrapperShadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import type { AromaFamily } from '@/lib/aromas/queries'
import {
  BAND_FLOORS,
  COMPLETENESS,
  EMPTY_FACETS,
  facetsToSearchParams,
  isFacetActive,
  STRENGTHS,
  toggleBandFloor,
  toggleCompleteness,
  toggleFacet,
  WRAPPER_SHADES,
  type Completeness,
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

/* One label per hole: « À compléter » said three ways since the sourced
   proposals of 6 septembre 2026 — a contributor picks the hole they can fill. */
const COMPLETENESS_LABELS: Record<Completeness, string> = {
  renseignee: m.referential.facets.complete,
  'sans-vitole': m.referential.facets.missingVitola,
  'sans-force': m.referential.facets.missingStrength,
  'sans-aromes': m.referential.facets.missingAromas,
}

function href(facets: Facets): string {
  const params = facetsToSearchParams(facets)
  const query = params.toString()
  return query ? `${routes.cigars()}?${query}` : routes.cigars()
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="eyebrow mb-2">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function FacetLink({ label, active, target }: { label: string; active: boolean; target: string }) {
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

type PanelProps = {
  facets: Facets
  /** Origins present in the published set, so no facet leads to zero results. */
  countries: readonly string[]
  /**
   * The eleven families, and only the families. « Affiner avec les arômes »
   * (QA du 12 septembre 2026) at the grain a side panel can hold: seventy-six
   * descriptors as chips would be taller than the results beside them. The
   * descriptor grain lives on the wheel of `/aromes`, which writes the same
   * `arome=` key — one filter, two entrances.
   */
  aromaFamilies: readonly AromaFamily[]
}

/**
 * Two shapes, one body — and the duplication is the cheaper of the two costs.
 *
 * QA of 13 septembre 2026: « sur mobile, toute la partie de filtre est
 * beaucoup trop longue, il faut qu'elle soit sous un menu déroulant replié par
 * défaut ». Under `md` this panel is a full-width block ABOVE the results, so a
 * reader arriving on `/cigares` scrolled past thirty-odd chips before seeing a
 * single cigar. From `md` up it is the 16rem sidebar it was built to be, and
 * collapsing it there would leave a column holding one word.
 *
 * A disclosure whose initial state depends on the viewport cannot be written in
 * CSS: `open` is a DOM attribute, and a closed `<details>` hides its content in
 * the UA shadow root, where a stylesheet cannot reach it. That leaves two
 * options, and both cost something:
 *
 *   - **a client component** reading `matchMedia`. It renders closed on the
 *     server and opens after hydration — a visible layout shift in the sidebar,
 *     on the page P8 measured at CLS 0, plus the first JavaScript this panel has
 *     ever needed. Its whole design is that a facet is an `<a>`.
 *   - **two wrappers around one body.** Roughly 35 extra anchors of static HTML,
 *     and exactly one of the two is in the accessibility tree at any width,
 *     because `hidden md:block` is `display: none` and that removes a subtree
 *     from the tree rather than merely hiding it.
 *
 * The second keeps zero JavaScript and zero layout shift, so the second wins.
 * `FacetGroups` is the single source of the thirty-five links; only the frame
 * around it differs.
 */
export function FacetPanel(props: PanelProps) {
  return (
    <>
      <details className="border-rule group border-t border-b md:hidden">
        <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline gap-2">
            <span className="font-medium">{m.referential.facets.title}</span>
            {isFacetActive(props.facets) ? (
              <span className="text-accent text-xs">{m.referential.facets.someActive}</span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            strokeWidth={1.5}
            className="text-ink-muted size-4 shrink-0 transition-transform duration-(--duration-quick) group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-6 pt-1 pb-5">
          <ClearAll facets={props.facets} />
          <FacetGroups {...props} />
        </div>
      </details>

      <aside
        className="hidden flex-col gap-6 md:flex"
        aria-label={m.referential.facets.title}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-medium">{m.referential.facets.title}</h2>
          <ClearAll facets={props.facets} />
        </div>
        <FacetGroups {...props} />
      </aside>
    </>
  )
}

function ClearAll({ facets }: { facets: Facets }) {
  if (!isFacetActive(facets)) return null
  return (
    <Link
      href={href({ ...EMPTY_FACETS, query: facets.query })}
      className="text-ink-muted hover:text-ink self-start text-xs underline underline-offset-4"
    >
      {m.referential.facets.clearAll}
    </Link>
  )
}

function FacetGroups({ facets, countries, aromaFamilies }: PanelProps) {
  return (
    <>
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

      <FacetGroup title={m.referential.facets.rating}>
        {BAND_FLOORS.map((floor) => (
          <FacetLink
            key={floor}
            label={
              floor === 5
                ? m.referential.facets.ratingAll
                : m.referential.facets.ratingFloor.replace('{count}', String(floor))
            }
            active={facets.minBands === floor}
            target={href(toggleBandFloor(facets, floor))}
          />
        ))}
      </FacetGroup>

      {aromaFamilies.length > 0 ? (
        <FacetGroup title={m.referential.facets.aroma}>
          {aromaFamilies.map((family) => (
            <FacetLink
              key={family.slug}
              label={family.label}
              active={facets.aromas.includes(family.slug)}
              target={href(toggleFacet(facets, 'aromas', family.slug))}
            />
          ))}
          <p className="text-ink-faint basis-full text-xs leading-relaxed">
            {m.referential.facets.aromaHint}
          </p>
        </FacetGroup>
      ) : null}

      <FacetGroup title={m.referential.facets.completeness}>
        {COMPLETENESS.map((value) => (
          <FacetLink
            key={value}
            label={COMPLETENESS_LABELS[value]}
            active={facets.completeness === value}
            target={href(toggleCompleteness(facets, value))}
          />
        ))}
        <p className="text-ink-faint basis-full text-xs leading-relaxed">
          {m.referential.facets.completenessHint}
        </p>
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
    </>
  )
}
