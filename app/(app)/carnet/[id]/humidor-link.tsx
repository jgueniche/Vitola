import { formatEffectiveDate } from '@/lib/cigar'
import { lotsForCigar, smokeEventForReview } from '@/lib/humidor/queries'
import { m } from '@/lib/i18n'

import { AttachSmokeForm } from './attach-smoke-form'

const copy = m.humidor

/**
 * Whether this entry has been taken out of a humidor — and the button that
 * takes it out, when it has not.
 *
 * This section is the price ADR 0006 D1 agreed to pay. Smoking *from the cave*
 * is atomic: `smoke_from_humidor()` writes the entry and the event in one
 * transaction. A structured tasting is not, because a function taking the
 * twenty-four columns of `reviews` would be a second schema that drifts. So the
 * tasting path writes twice, and the ADR's argument for accepting that is
 * exactly this component: **the gap is visible**, and closing it is one click.
 *
 * An entry the member does not own shows nothing. What somebody else has in
 * their humidor is not on a page about what they thought of a cigar.
 */
export async function HumidorLink({
  reviewId,
  cigarId,
  isMine,
}: {
  reviewId: string
  cigarId: string
  isMine: boolean
}) {
  if (!isMine) return null

  const event = await smokeEventForReview(reviewId)
  if (event) {
    return (
      <p className="text-ink-muted text-sm">
        {copy.linkedBody.replace('{date}', formatEffectiveDate(event.occurred_at))}
      </p>
    )
  }

  const lots = await lotsForCigar(cigarId)
  if (lots.length === 0) return null

  return (
    <section className="border-rule flex flex-col gap-3 rounded-[3px] border border-dashed px-4 py-4">
      <p className="eyebrow">{copy.notLinkedTitle}</p>
      <p className="text-ink-muted measure text-sm leading-relaxed">{copy.notLinkedBody}</p>
      <AttachSmokeForm
        reviewId={reviewId}
        lots={lots.map((lot) => ({
          id: lot.id,
          qty: lot.qty,
          label: lot.purchase_date ?? copy.ageUnknown,
        }))}
      />
    </section>
  )
}
