import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { Breadcrumb } from '@/components/layout/breadcrumb'
import { EmptyState } from '@/components/layout/empty-state'
import { SectionHead } from '@/components/layout/section-head'
import { listAromaWheel } from '@/lib/aromas/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { WheelNav } from './wheel-nav'

export const metadata: Metadata = { title: m.aromas.title }

/**
 * The aroma wheel — as a wheel, and as a way in.
 *
 * It was a list. The reason written here was that the circular form of §5.4
 * belongs to the *selection* control of the tasting form, because "here there
 * is nothing to select, and a circle would be decoration". The QA session of
 * 12 septembre 2026 disagreed in five words — « pourquoi t'as enlevé la roue »
 * — and it was right for a reason the old note missed: there IS something to
 * select here. Not a tasting note: a filter. Every descriptor leads to the
 * sheets whose profile cites it, so the circle puts eleven families and
 * seventy-six descriptors one gesture from the referential.
 *
 * The list stays under it. Whoever reviews the seed needs the eighty-seven
 * rows laid out, and the omissions are only visible like that — never in a
 * CSV, and not in a circle either.
 */
export default async function AromasPage() {
  const families = await listAromaWheel()
  const descriptors = families.reduce((total, family) => total + family.descriptors.length, 0)

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <Breadcrumb
        trail={[{ label: m.referential.cigarsTitle, href: routes.cigars() }]}
        className="-mb-4"
      />

      <SectionHead eyebrow={m.aromas.eyebrow} title={m.aromas.title} lede={m.aromas.lede} />

      {families.length === 0 ? (
        <EmptyState title={m.aromas.emptyTitle} description={m.aromas.emptyBody} />
      ) : (
        <>
          <WheelNav families={families} />

          <Band variant="divider" />

          <section aria-labelledby="familles" className="flex flex-col gap-4">
            <SectionHead id="familles" level="h2" size="sm" title={m.aromas.listTitle} />
            <p className="text-ink-faint font-mono text-xs">
              {m.aromas.count
                .replace('{families}', String(families.length))
                .replace('{descriptors}', String(descriptors))}
            </p>

            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {families.map((family) => (
                <section key={family.slug} aria-labelledby={`famille-${family.slug}`}>
                  <h3 id={`famille-${family.slug}`} className="eyebrow text-ink">
                    {family.label}
                  </h3>
                  <ul className="border-rule mt-2 flex flex-col border-t">
                    {family.descriptors.map((descriptor) => (
                      <li
                        key={descriptor.slug}
                        className="border-rule flex items-baseline justify-between gap-4 border-b py-2"
                      >
                        <span className="text-sm">{descriptor.label}</span>
                        <span className="text-ink-faint font-mono text-xs">{descriptor.slug}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
