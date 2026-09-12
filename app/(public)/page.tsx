import Link from 'next/link'

import { CigarPlate } from '@/components/landing/cigar-plate'
import { LandingHeader } from '@/components/landing/landing-header'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * Landing page, seen before the age gate.
 *
 * Its history is a pendulum, and this is the fourth state. It began as a door —
 * a title, a band, one link. It then described nine modules with mocked
 * screens, argument lists and a pricing table, which the owner found
 * "surchargée pour rien" (6 septembre 2026). The third state cut that to one
 * sentence, the object, six lines on what is behind the door, and the door.
 *
 * The QA session of 12 septembre 2026 cut the last of it: « enlève les
 * descriptions sous le cigare qui fume, enlève toute la section derrière la
 * porte — du sobre, de l'élégant, limite un peu de mystère, comme un club ».
 * So: a name, a line, the object, and the door. A club does not publish its
 * contents on the street, and the six lines were the last thing on this page
 * that explained itself to someone who had not come in yet.
 *
 * The object is a LIT cigar, and that is a decision taken by the product
 * owner. §2 of the brief and the Évin law forbid promoting tobacco, and an
 * illustration of a lit cigar in front of the age gate sits close to that
 * line. Until today the plate carried its own defence — annotated like a
 * plate in a reference work, captioned in measurements rather than adjectives.
 * Those captions are what the owner removed, so the drawing now stands on
 * what is left: no brand name anywhere, no adjective, no act of consumption
 * beyond the object itself, and a page that names no product. That is a
 * THINNER defence than the annotated plate, and the entry under « À trancher
 * avant commercialisation » in the root CLAUDE.md says so in those terms. Do
 * not quietly reopen it here; do not quietly widen it either.
 */

const ENTER =
  'bg-accent text-on-accent hover:bg-accent-bright rounded-band inline-flex h-11 items-center px-7 text-sm font-medium transition-colors duration-(--duration-quick)'

export default function HomePage() {
  return (
    <>
      <LandingHeader />

      {/* The whole page is one screen's worth: the door is above the fold on a
          laptop, and there is nothing under it to scroll toward. */}
      <main id="contenu" className="flex flex-col">
        <section className="mx-auto w-full max-w-5xl px-4 pt-20 sm:pt-28">
          <div className="mx-auto max-w-[38rem] text-center">
            <p className="eyebrow">{m.home.eyebrow}</p>
            <h1 className="font-display text-display-md sm:text-display-lg mt-6 text-balance">
              {m.home.title}
            </h1>
            <p className="text-ink-muted mx-auto mt-5 max-w-[30em] text-sm leading-relaxed text-pretty">
              {m.landing.hero.lede}
            </p>
          </div>
        </section>

        {/* The object, and nothing said about it. */}
        <div className="mx-auto w-full max-w-5xl sm:px-4">
          <CigarPlate />
        </div>

        <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-4 pb-20 text-center sm:pb-28">
          <span aria-hidden="true" className="brass-rule h-px w-full max-w-[220px]" />
          <Link href={routes.ageGate()} className={ENTER}>
            {m.home.enter}
          </Link>
          <p className="text-ink-faint max-w-[34em] text-xs leading-relaxed">{m.home.enterHint}</p>
          <Link
            href={routes.shop()}
            className="text-ink-muted hover:text-ink text-xs underline-offset-4 transition-colors duration-(--duration-quick) hover:underline"
          >
            {m.landing.hero.shopCta}
          </Link>
        </section>
      </main>
    </>
  )
}
