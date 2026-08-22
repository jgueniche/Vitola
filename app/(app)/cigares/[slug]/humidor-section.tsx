import Link from 'next/link'

import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { formatCount, todayInBrandZone } from '@/lib/format'
import { listHumidors, lotsForCigar } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

import { SmokeForm } from '../../cave/[id]/lot-forms'

const copy = m.humidor

/**
 * The humidor, on the cigar page: do I have this one, and am I smoking one now.
 *
 * This is the half of P2's exit criterion that a member actually performs.
 * §9 asks to "décrémenter la cave de bout en bout", and the end one starts from
 * is almost never `/cave` — it is the page of the cigar in one's hand.
 *
 * Renders nothing for a signed-out visitor. Not an empty state, nothing at all:
 * a stranger's humidor is not a concept this page should introduce, and §4.6's
 * "an empty state is an invitation" is about a place one has arrived at, not
 * about a section one has no business seeing.
 *
 * The lots are ordered oldest-first by `lotsForCigar`, so the one offered by
 * default is the one that has rested longest. That is what FIFO means in a
 * humidor, and getting it right by ordering costs nothing where getting it
 * wrong would quietly age the wrong box.
 */
export async function HumidorSection({ cigarId, slug }: { cigarId: string; slug: string }) {
  const user = await currentUser()
  if (!user) return null

  const [lots, humidors] = await Promise.all([lotsForCigar(cigarId), listHumidors()])
  if (humidors.length === 0) return null

  const held = lots.reduce((sum, lot) => sum + lot.qty, 0)
  const first = lots[0]
  const target = humidors.find((humidor) => humidor.is_default) ?? humidors[0]

  return (
    <section className="flex flex-col gap-6">
      <Band variant="divider" />

      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">{copy.inHumidor}</h2>
        <p className="text-ink-muted text-sm">
          {held > 0
            ? copy.inHumidorCount.replace('{count}', formatCount(held))
            : copy.inHumidorNone}
        </p>
      </div>

      {first ? (
        <>
          {/* Which lot, when there is more than one. A sentence rather than a
              selector: the form below draws from the oldest, and offering a
              choice of three identical-looking lots is a decision nobody has
              the information to make from this page. The cave has it. */}
          {lots.length > 1 ? (
            <p className="text-ink-muted text-sm">
              {copy.smokeLotOption
                .replace('{cigar}', lotLabel(first.purchase_date, first.aging_days))
                .replace('{count}', String(first.qty))}{' '}
              <Link href={routes.humidorDetail(first.humidor_id)} className="text-accent underline">
                {copy.open}
              </Link>
            </p>
          ) : null}

          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.smokeLede}</p>
          <SmokeForm itemId={first.id} slug={slug} today={todayInBrandZone()} max={first.qty} />
        </>
      ) : (
        <div>
          {target ? (
            <Link
              href={`${routes.humidorDetail(target.id)}?q=${encodeURIComponent(slug.replaceAll('-', ' '))}`}
            >
              <Button variant="secondary" size="sm">
                {copy.putAway}
              </Button>
            </Link>
          ) : null}
        </div>
      )}
    </section>
  )
}

/** A lot, named by what distinguishes it from the next one: when it arrived. */
function lotLabel(purchaseDate: string | null, agingDays: number | null): string {
  if (purchaseDate) return purchaseDate
  if (agingDays !== null) return copy.ageDays.replace('{count}', String(agingDays))
  return copy.ageUnknown
}
