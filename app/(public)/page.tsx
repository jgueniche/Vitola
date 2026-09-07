import Link from 'next/link'

import { CigarPlate } from '@/components/landing/cigar-plate'
import { LandingHeader } from '@/components/landing/landing-header'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * Landing page, seen before the age gate.
 *
 * Its history is a pendulum. It began as a door — a title, a band, one link —
 * and nothing on it said what was behind, so a visitor had no reason to hand
 * over a date of birth. It then described nine modules with mocked screens,
 * argument lists and a pricing table, and the owner found it "surchargée pour
 * rien" (6 septembre 2026). This is the third state, and the one to keep:
 * one sentence, the object the site is about, six lines on what is behind
 * the door, and the door.
 *
 * The object is a LIT cigar, and that is a decision taken by the product
 * owner. §2 of the brief and the Évin law forbid promoting tobacco, and an
 * illustration of a lit cigar in front of the age gate sits close to that
 * line. The plate is built to stay on the right side of it — annotated like
 * a plate in a reference work, captioned with measurements rather than
 * adjectives, no brand name anywhere. The placement is accepted and does not
 * block anything today; it is listed under « À trancher avant
 * commercialisation » in the root CLAUDE.md, for legal review before the site
 * opens commercially. Do not quietly reopen it here.
 *
 * Only what exists is listed. The band scanner, the partners' charter and the
 * Cercle wait for their keys and their decisions (P4, P7); a landing page that
 * promises them is a landing page for a product that does not exist.
 */

const MODULES = ['referentiel', 'carnet', 'cave', 'reseau', 'lieux', 'boutique'] as const

const ENTER =
  'bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-11 items-center px-6 text-sm font-medium transition-colors duration-(--duration-quick)'

export default function HomePage() {
  const mods = m.landing.modules

  return (
    <>
      <LandingHeader />

      <main id="contenu">
        {/* ------------------------------------------------------------- hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 sm:pt-24">
          <div className="mx-auto max-w-[44rem] text-center">
            <p className="eyebrow">{m.home.eyebrow}</p>
            <h1 className="font-display text-display-md sm:text-display-lg mt-5 text-balance">
              {m.home.title}
            </h1>
            <p className="text-ink-muted mx-auto mt-6 max-w-[36em] text-lg leading-relaxed text-pretty">
              {m.landing.hero.lede}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link href={routes.ageGate()} className={ENTER}>
                {m.home.enter}
              </Link>
              <Link
                href={routes.shop()}
                className="text-ink-muted hover:text-ink text-sm underline-offset-4 transition-colors duration-(--duration-quick) hover:underline"
              >
                {m.landing.hero.shopCta}
              </Link>
            </div>
            <p className="text-ink-faint mt-3 text-xs">{m.home.enterHint}</p>
          </div>
        </section>

        {/* Narrower than the text columns: a full-bleed cigar was too big. */}
        <div className="mx-auto mt-6 w-full max-w-5xl sm:mt-2 sm:px-4">
          <CigarPlate />
        </div>

        {/* -------------------------------------------------- behind the door */}
        <section className="border-rule mx-auto w-full max-w-6xl border-t px-4 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="eyebrow">{m.landing.inside.eyebrow}</p>
              <h2 className="font-display text-display-sm mt-4 text-balance">
                {m.landing.inside.title}
              </h2>
              <p className="text-ink-muted mt-4 text-sm leading-relaxed">{m.landing.inside.body}</p>
            </div>

            <ol className="border-rule grid border-b sm:grid-cols-2 sm:gap-x-10">
              {MODULES.map((key) => (
                <li
                  key={key}
                  className="border-rule grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t py-4"
                >
                  <span className="text-ink-faint pt-1 font-mono text-[11px]">
                    {mods[key].number}
                  </span>
                  <div>
                    <p className="text-ink font-medium">{mods[key].name}</p>
                    <p className="text-ink-muted mt-1 text-sm leading-relaxed">{mods[key].line}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------------------- entrer */}
        <section className="border-rule border-t">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-4 py-16 text-center sm:py-20">
            <span aria-hidden="true" className="brass-rule h-px w-full max-w-[280px]" />
            <p className="eyebrow">{m.landing.final.eyebrow}</p>
            <p className="text-ink max-w-[34em] text-lg leading-relaxed text-pretty">
              {m.landing.final.title}
            </p>
            <p className="text-ink-muted max-w-[36em] text-sm leading-relaxed">
              {m.landing.final.body}
            </p>
            <Link href={routes.ageGate()} className={ENTER}>
              {m.home.enter}
            </Link>
            <p className="text-ink-muted max-w-[36em] text-xs leading-relaxed">
              {m.landing.final.help}
            </p>
          </div>
        </section>
      </main>
    </>
  )
}
