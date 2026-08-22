import Link from 'next/link'

import { Band } from '@/components/band/band'
import { BRAND } from '@/lib/brand'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

/**
 * Landing page, seen before the age gate.
 *
 * Deliberately shows no cigar, no brand and no product: §2 forbids anything
 * promotional, and the gate has not been cleared. What it offers is the promise
 * and the door — the editorial home of the wireframe lives behind the gate.
 */
export default function HomePage() {
  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-20 sm:py-28">
      <div className="flex flex-col gap-6">
        <p className="eyebrow">{m.home.eyebrow}</p>
        <h1 className="font-display text-4xl leading-[1.1] sm:text-6xl">{m.home.title}</h1>
        <p className="text-ink-muted measure text-lg leading-relaxed">{m.home.lede}</p>
      </div>

      <Band brand={BRAND.name} vitola={BRAND.tagline} />

      <div className="flex flex-col items-start gap-2">
        <Link
          href={routes.ageGate()}
          className="bg-accent text-on-accent hover:bg-accent-bright inline-flex h-12 items-center rounded-[3px] px-6 text-sm font-medium transition-colors duration-(--duration-quick)"
        >
          {m.home.enter}
        </Link>
        <p className="text-ink-muted text-xs">{m.home.enterHint}</p>
      </div>
    </main>
  )
}
