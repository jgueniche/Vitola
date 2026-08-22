import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { EmptyState } from '@/components/layout/empty-state'
import { listAromaWheel } from '@/lib/aromas/queries'
import { m } from '@/lib/i18n'

export const metadata: Metadata = { title: m.aromas.title }

/**
 * The aroma wheel, as a reference page.
 *
 * It exists before the tasting form that will consume it, on purpose: a
 * nomenclature nobody can read is a table, not a vocabulary. Whoever reviews
 * the seed needs to see the eleven families and their descriptors laid out —
 * and the omissions are only visible like this, never in a CSV.
 *
 * Drawn as a list rather than as a wheel. The circular form of §5.4 belongs to
 * the *selection* control of the tasting form, where the geometry does work:
 * it puts every family one gesture away. Here there is nothing to select, and a
 * circle would be decoration.
 */
export default async function AromasPage() {
  const families = await listAromaWheel()
  const descriptors = families.reduce((total, family) => total + family.descriptors.length, 0)

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">{m.aromas.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{m.aromas.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{m.aromas.lede}</p>
      </div>

      <Band variant="divider" />

      {families.length === 0 ? (
        <EmptyState title={m.aromas.emptyTitle} description={m.aromas.emptyBody} />
      ) : (
        <>
          <p className="text-ink-faint font-mono text-xs">
            {m.aromas.count
              .replace('{families}', String(families.length))
              .replace('{descriptors}', String(descriptors))}
          </p>

          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {families.map((family) => (
              <section key={family.slug} aria-labelledby={`famille-${family.slug}`}>
                <h2 id={`famille-${family.slug}`} className="eyebrow text-ink">
                  {family.label}
                </h2>
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
        </>
      )}
    </main>
  )
}
