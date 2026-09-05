import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cigar'
import { formatCount } from '@/lib/format'
import { fillRatio, needsRotation } from '@/lib/humidor/model'
import { listAllLots, listHumidors } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

import { HumidorForm } from './humidor-form'

export const metadata: Metadata = { title: m.humidor.title }

const copy = m.humidor

/**
 * Ma cave — every humidor, and what they hold together.
 *
 * The page answers three questions in the order one asks them: how much do I
 * have, where is it, and what needs attention. The inventory itself lives one
 * click away, per humidor: §5.5 asks for several caves, and three lists nested
 * inside a fourth is not a page anybody reads.
 *
 * Signed out redirects rather than showing an empty state. A humidor has
 * nothing to show an anonymous visitor, and "connectez-vous" dressed as a
 * destination is a page pretending to be one — the notebook settled this.
 */
export default async function HumidorPage() {
  const user = await currentUser()
  if (!user) {
    redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.humidor())}`)
  }

  const [humidors, lots] = await Promise.all([listHumidors(), listAllLots()])

  const totalCigars = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const totalValue = lots.reduce((sum, lot) => sum + (lot.stock_value_eur ?? 0), 0)
  const priced = lots.some((lot) => lot.stock_value_eur !== null)
  const rotating = lots.filter((lot) => needsRotation(lot.aging_days, lot.last_smoked_on))

  const perHumidor = new Map<string, number>()
  for (const lot of lots) {
    perHumidor.set(lot.humidor_id, (perHumidor.get(lot.humidor_id) ?? 0) + lot.qty)
  }

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {humidors.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Link href={routes.cigars()}>
              <Button variant="secondary" size="sm">
                {copy.searchBrowse}
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <section className="border-rule bg-surface grid gap-px overflow-hidden rounded-[3px] border sm:grid-cols-3">
            <Figure value={formatCount(totalCigars)} label={copy.totalCigars} />
            <Figure
              value={priced ? formatPrice(totalValue) : '—'}
              label={copy.totalValue}
              muted={!priced}
            />
            <Figure
              value={
                humidors.length === 1
                  ? copy.countOne
                  : copy.countMany.replace('{count}', String(humidors.length))
              }
              label={copy.eyebrow}
            />
          </section>

          {rotating.length > 0 ? (
            <p className="border-rule text-ink-muted rounded-[3px] border border-dashed px-4 py-3 text-sm">
              <span className="text-ink">{copy.rotationFlag}</span> — {copy.rotationHint}{' '}
              {formatCount(rotating.length)}
            </p>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.eyebrow}</h2>
            <ul className="flex flex-col gap-2">
              {humidors.map((humidor) => {
                const held = perHumidor.get(humidor.id) ?? 0
                const ratio = fillRatio(held, humidor.capacity)
                return (
                  <li key={humidor.id}>
                    <Link
                      href={routes.humidorDetail(humidor.id)}
                      className="border-rule hover:border-rule-strong bg-surface flex items-center justify-between gap-4 rounded-[3px] border px-4 py-3 transition-colors duration-(--duration-quick)"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="text-ink">{humidor.name}</span>
                          {humidor.is_default ? (
                            <span className="eyebrow text-accent">{copy.defaultBadge}</span>
                          ) : null}
                        </span>
                        <span className="text-ink-muted text-sm">
                          {humidor.capacity
                            ? copy.fill
                                .replace('{count}', String(held))
                                .replace('{capacity}', String(humidor.capacity))
                            : copy.fillNoCapacity.replace('{count}', String(held))}
                        </span>
                      </span>
                      {ratio !== null ? <Gauge ratio={ratio} /> : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-display-sm">{copy.csvTitle}</h2>
            <p className="text-ink-muted measure text-sm leading-relaxed">{copy.csvLede}</p>
            <div>
              {/* A plain anchor, not a fetch: the export is a route handler
                  that answers with a file, and a browser already knows what to
                  do with one. `download` rather than a new tab, so a CSV that a
                  browser decides to render inline still lands as a file. */}
              <a href={routes.humidorExport()} download>
                <Button variant="secondary">{copy.csvExport}</Button>
              </a>
            </div>
          </section>
        </>
      )}

      <section className="border-rule flex flex-col gap-3 border-t pt-8">
        <h2 className="font-display text-display-sm">{copy.createTitle}</h2>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.createLede}</p>
        <HumidorForm mode="create" />
      </section>
    </main>
  )
}

function Figure({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="bg-surface flex flex-col gap-1 px-4 py-4">
      <span className={cn('font-display text-display-sm', muted && 'text-ink-muted')}>{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  )
}

/** A fill level, drawn rather than written. Capped: over-full is still full. */
function Gauge({ ratio }: { ratio: number }) {
  const percent = Math.min(100, Math.round(ratio * 100))
  return (
    <span className="border-rule-strong h-2 w-24 shrink-0 overflow-hidden rounded-[2px] border">
      <span
        className={cn('block h-full', percent >= 100 ? 'bg-negative' : 'bg-accent')}
        style={{ width: `${percent}%` }}
      />
    </span>
  )
}
