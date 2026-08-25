import {
  Archive,
  Award,
  ChartColumn,
  ChevronRight,
  Columns2,
  Compass,
  Droplet,
  FileCheck2,
  Flag,
  GitBranch,
  Hash,
  Layers,
  ListFilter,
  PencilLine,
  ScanLine,
  ShieldCheck,
  Target,
  Timer,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { CigarPlate } from '@/components/landing/cigar-plate'
import {
  HumidorFigure,
  NetworkFigure,
  PartnersFigure,
  PlansFigure,
  ReferentialFigure,
  ScanFigure,
  ShopFigure,
  TastingFigure,
  VenuesFigure,
} from '@/components/landing/figures'
import { LandingHeader } from '@/components/landing/landing-header'
import { ModuleHead, Points } from '@/components/landing/parts'
import { WRAPPER_SHADES, wrapperShadeLabel } from '@/components/data/wrapper-scale'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * Landing page, seen before the age gate.
 *
 * It used to be a door: a title, a band and one link. Nothing on it said what
 * was behind, which left a visitor no reason to hand over a date of birth. It
 * now describes the nine modules, and shows the object the site is about.
 *
 * That last part is a decision taken by the product owner. §2 of the brief and
 * the Évin law forbid promoting tobacco, and an illustration of a LIT cigar in
 * front of the age gate sits close to that line. The illustration is built to
 * stay on the right side of it — annotated like a plate in a reference work,
 * captioned with measurements rather than adjectives, no brand name anywhere.
 *
 * The placement itself is accepted and does not block anything today; it is
 * listed under « À trancher avant commercialisation » in the root CLAUDE.md,
 * for legal review before the site opens commercially. Do not quietly reopen
 * it here — move the entry, or leave it alone.
 */

const SHADE_SWATCH = [
  'bg-shade-claro',
  'bg-shade-colorado-claro',
  'bg-shade-colorado',
  'bg-shade-colorado-maduro',
  'bg-shade-maduro',
  'bg-shade-oscuro',
] as const

/* The shop leads (owner's decision, 25 août 2026): it is the one module a
   visitor can walk into from this very page, no date of birth asked, cart
   and demo payment included. The numbers in fr.json follow this order. */
const MODULE_ORDER = [
  'boutique',
  'referentiel',
  'scan',
  'degustation',
  'cave',
  'reseau',
  'lieux',
  'partenaires',
  'cercle',
] as const

function Section({
  id,
  children,
  className,
}: {
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`border-rule border-t py-20 sm:py-26 ${className ?? ''}`}>
      <div className="mx-auto w-full max-w-6xl px-4">{children}</div>
    </section>
  )
}

/** Two columns on a wide screen, stacked on a narrow one, figure first or last. */
function Split({
  children,
  figure,
  reversed = false,
}: {
  children: ReactNode
  figure: ReactNode
  reversed?: boolean
}) {
  return (
    /* min-w-0 is load-bearing: a grid item defaults to min-width:auto and
       grows to fit its content, so the humidor table — which cannot shrink
       below its columns — was widening the whole page on a phone. */
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-18">
      <div className={`min-w-0 ${reversed ? 'lg:order-2' : ''}`}>{children}</div>
      <div className={`min-w-0 ${reversed ? 'lg:order-1' : ''}`}>{figure}</div>
    </div>
  )
}

export default function HomePage() {
  const mods = m.landing.modules

  return (
    <>
      <LandingHeader />

      <main id="contenu">
        {/* ------------------------------------------------------------- hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto w-full max-w-6xl px-4 pt-16 sm:pt-24">
            <div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-24">
              <div>
                <p className="eyebrow">{m.home.eyebrow}</p>
                <h1 className="font-display mt-4 text-[2.5rem] leading-[1.06] text-balance sm:text-6xl lg:text-[4.5rem]">
                  {m.home.title}
                </h1>
                <p className="text-ink-muted mt-6 max-w-[34em] text-lg leading-relaxed">
                  {m.landing.hero.lede}{' '}
                  <em className="text-ink not-italic">{m.landing.hero.ledeEmphasis}</em>
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href={routes.shop()}
                    className="bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-12 items-center px-6 text-base font-medium transition-colors duration-(--duration-quick)"
                  >
                    {m.landing.hero.shopCta}
                  </Link>
                  <Link
                    href={routes.ageGate()}
                    className="border-rule-strong text-ink hover:bg-surface-raised rounded-band inline-flex h-12 items-center border px-6 text-base transition-colors duration-(--duration-quick)"
                  >
                    {m.home.enter}
                  </Link>
                </div>
                <p className="text-ink-muted mt-3 text-xs">
                  {m.landing.hero.shopCtaHint} {m.home.enterHint}
                </p>
              </div>

              {/* The page's own table of contents. It doubles as navigation on
                  a narrow screen, where the header nav is hidden. */}
              <nav aria-label={m.landing.hero.tocTitle} className="lg:pt-2">
                <div className="flex items-baseline justify-between pb-3">
                  <span className="eyebrow">{m.landing.hero.tocTitle}</span>
                  <span className="text-ink-faint font-mono text-[11px]">
                    {MODULE_ORDER.length.toString().padStart(2, '0')}
                  </span>
                </div>
                <ol>
                  {MODULE_ORDER.map((key) => (
                    <li key={key} className="border-rule border-t">
                      <a
                        href={`#${key}`}
                        className="text-ink hover:text-accent-bright grid grid-cols-[34px_1fr_auto] items-baseline gap-3.5 py-3.5 text-[0.9375rem] transition-colors duration-(--duration-quick)"
                      >
                        <span className="text-ink-faint font-mono text-[11px]">
                          {mods[key].number}
                        </span>
                        <span>{mods[key].name}</span>
                        <span className="font-eyebrow text-ink-muted text-[11px] tracking-[0.1em] uppercase">
                          {mods[key].kind}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </div>

          <div className="mt-8 sm:mt-10">
            <CigarPlate />
          </div>
        </section>

        {/* ------------------------------------------- the wrapper shade scale */}
        <Section>
          <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-18">
            <div>
              <p className="eyebrow">{m.landing.scale.eyebrow}</p>
              <h2 className="font-display mt-4 text-2xl leading-tight text-balance sm:text-[1.75rem]">
                {m.landing.scale.title}
              </h2>
            </div>
            <p className="text-ink-muted text-[1.0625rem] leading-relaxed">
              {m.landing.scale.body}
            </p>
          </div>

          <div className="border-rule bg-rule rounded-band mt-12 grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 lg:grid-cols-6">
            {WRAPPER_SHADES.map((shade, index) => (
              <div key={shade} className="bg-surface flex flex-col gap-3.5 p-5">
                <span aria-hidden="true" className={`h-14 rounded-[2px] ${SHADE_SWATCH[index]}`} />
                <div>
                  <div className="font-eyebrow text-ink text-xs tracking-[0.12em] uppercase">
                    {wrapperShadeLabel(shade)}
                  </div>
                  <div className="text-ink-faint font-mono text-[11px]">{`0${index + 1}`} / 06</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------ 01 la boutique
            First among the modules (owner's decision, 25 août 2026): the one
            section whose CTA is a real destination for the visitor reading
            this page — /boutique is public, cart and demo payment included. */}
        <Section id="boutique">
          <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-18">
            <ModuleHead
              number={mods.boutique.number}
              name={mods.boutique.name}
              title={mods.boutique.title}
            />
            <p className="text-ink-muted text-[1.0625rem] leading-relaxed">{mods.boutique.body}</p>
          </div>
          <div className="mt-12">
            <ShopFigure />
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href={routes.shop()}
              className="bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-12 items-center px-6 text-base font-medium transition-colors duration-(--duration-quick)"
            >
              {mods.boutique.cta}
              <ChevronRight aria-hidden="true" className="ml-1.5 size-4" strokeWidth={1.5} />
            </Link>
            <span className="text-ink-muted text-xs">{mods.boutique.ctaHint}</span>
          </div>
        </Section>

        {/* ------------------------------------------------------ 02 le wiki */}
        <Section id="referentiel">
          <Split figure={<ReferentialFigure />}>
            <ModuleHead {...mods.referentiel} />
            <Points
              points={mods.referentiel.points}
              icons={[ListFilter, Columns2, Hash, GitBranch]}
            />
          </Split>
        </Section>

        {/* --------------------------------------------------- 03 la reconnaissance */}
        <Section id="scan">
          <Split reversed figure={<ScanFigure />}>
            <ModuleHead {...mods.scan} />
            <Points points={mods.scan.points} icons={[ScanLine, Layers, Target, PencilLine]} />
          </Split>
        </Section>

        {/* ------------------------------------------------------ 04 la dégustation */}
        <Section id="degustation">
          <Split figure={<TastingFigure />}>
            <ModuleHead {...mods.degustation} />
            <Points points={mods.degustation.points} icons={[ChartColumn, Compass, Timer]} />
          </Split>
        </Section>

        {/* ------------------------------------------------------------- 05 la cave */}
        <Section id="cave">
          <Split reversed figure={<HumidorFigure />}>
            <ModuleHead {...mods.cave} />
            <Points points={mods.cave.points} icons={[Archive, Droplet, FileCheck2]} />
          </Split>
        </Section>

        {/* ----------------------------------------------------------- 06 le réseau */}
        <Section id="reseau">
          <Split figure={<NetworkFigure />}>
            <ModuleHead {...mods.reseau} />
            <Points points={mods.reseau.points} icons={[Users, ShieldCheck, Award, Flag]} />
          </Split>
        </Section>

        {/* ------------------------------------------------------------ 07 les lieux */}
        <Section id="lieux">
          <ModuleHead {...mods.lieux} className="max-w-3xl" />
          <div className="mt-12">
            <VenuesFigure />
          </div>
        </Section>

        {/* ------------------------------------------------------ 08 les partenaires */}
        <Section id="partenaires">
          <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-18">
            <ModuleHead
              number={mods.partenaires.number}
              name={mods.partenaires.name}
              title={mods.partenaires.title}
            />
            <p className="text-ink-muted text-[1.0625rem] leading-relaxed">
              {mods.partenaires.body}
            </p>
          </div>
          <div className="mt-12">
            <PartnersFigure />
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href={routes.legalNotice()}
              className="border-rule-strong text-ink hover:bg-surface-raised rounded-band inline-flex h-12 items-center border px-6 text-base transition-colors duration-(--duration-quick)"
            >
              {mods.partenaires.figure.cta}
              <ChevronRight aria-hidden="true" className="ml-1.5 size-4" strokeWidth={1.5} />
            </Link>
            <span className="text-ink-muted text-xs">{mods.partenaires.figure.ctaHint}</span>
          </div>
        </Section>

        {/* ----------------------------------------------------------- 09 le Cercle */}
        <Section id="cercle">
          <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-18">
            <ModuleHead
              number={mods.cercle.number}
              name={mods.cercle.name}
              title={mods.cercle.title}
            />
            <p className="text-ink-muted text-[1.0625rem] leading-relaxed">{mods.cercle.body}</p>
          </div>
          <div className="mt-12">
            <PlansFigure />
          </div>
          <p className="text-ink-muted mt-6 text-xs">{mods.cercle.figure.note}</p>
        </Section>

        {/* --------------------------------------------------------------- entrer */}
        <Section className="text-center">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
            <span aria-hidden="true" className="brass-rule h-px w-full max-w-[420px]" />
            <p className="eyebrow">{m.landing.final.eyebrow}</p>
            <h2 className="font-display text-3xl leading-tight text-balance sm:text-[2.75rem]">
              {m.landing.final.title}
            </h2>
            <p className="text-ink-muted max-w-[38em] text-[1.0625rem] leading-relaxed">
              {m.landing.final.body}
            </p>
            <Link
              href={routes.ageGate()}
              className="bg-accent text-on-accent hover:bg-accent-bright rounded-band mt-1 inline-flex h-12 items-center px-6 text-base font-medium transition-colors duration-(--duration-quick)"
            >
              {m.home.enter}
            </Link>
            <span aria-hidden="true" className="brass-rule mt-3 h-px w-full max-w-[420px]" />
            <p className="text-ink-muted max-w-[36em] text-[13px] leading-relaxed">
              {m.health.notice} {m.landing.final.help}
            </p>
          </div>
        </Section>
      </main>
    </>
  )
}
