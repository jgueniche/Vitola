import type { Metadata } from 'next'
import Link from 'next/link'

import { Band } from '@/components/band/band'
import { RingGauge } from '@/components/data/ring-gauge'
import { shapeLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { listVitolas } from '@/lib/referential/queries'
import { routes } from '@/lib/routes'

/**
 * Rendered per request, not prerendered at build time.
 *
 * The obvious alternative — ISR with `revalidate` — makes the build itself
 * query the database, which couples every deploy to Supabase being reachable at
 * that minute and forces CI to hold credentials to compile a page. Neither is a
 * price worth paying for a list of 114 brands.
 *
 * It also happens to be the honest model for a wiki: the referential changes
 * when a contributor changes it, not when someone redeploys. If the query cost
 * ever shows up in a measurement, the fix is a cache around the read, not a
 * build step that can go stale.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: m.referential.vitolasTitle }

/**
 * The vitolario: the format as an entry point to the referential (§10.1).
 *
 * Ordered by ring gauge then length, not alphabetically. The vitolario is a
 * scale of shapes; reading it as one is the point, and an alphabetical list
 * puts Lancero next to Laguito for no reason a smoker would recognise.
 *
 * The 14 entries flagged "Dimensions à vérifier" carry that flag on screen.
 * Hiding an uncertainty a reviewer could resolve is how it stops being resolved.
 */
export default async function VitolasPage() {
  const vitolas = await listVitolas()

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">{m.referential.eyebrow}</p>
        <h1 className="font-display text-4xl">{m.referential.vitolasTitle}</h1>
      </div>

      <Band variant="divider" />

      <ul className="flex flex-col gap-3">
        {vitolas.map((vitola) => {
          const toVerify = vitola.notes?.startsWith(m.referential.vitola.toVerify) ?? false
          return (
            <li key={vitola.id}>
              <Link
                href={routes.vitola(vitola.slug)}
                className="border-rule bg-surface hover:border-rule-strong flex flex-wrap items-center justify-between gap-4 rounded-[3px] border px-4 py-3 transition-colors"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-lg leading-tight">
                    {vitola.name_salida}
                  </span>
                  <span className="text-ink-muted text-xs">
                    {vitola.name_galera ? `${vitola.name_galera} · ` : null}
                    {shapeLabel(vitola.shape)}
                    {toVerify ? (
                      <span className="text-caution"> · {m.referential.vitola.toVerify}</span>
                    ) : null}
                  </span>
                </span>
                <RingGauge ringGauge={vitola.ring_gauge} lengthMm={vitola.length_mm} />
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
