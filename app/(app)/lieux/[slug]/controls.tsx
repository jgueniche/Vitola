'use client'

// window.confirm before the two destructive gestures — withdrawing a proposal
// deletes it, removing a review is a deletion too. Everything non-destructive
// on this sheet is a plain server-action form in the page itself.
import { deleteVenueReview, withdrawVenue } from '@/app/(app)/lieux/actions'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'

const copy = m.venues

export function WithdrawVenueForm({ venueId }: { venueId: string }) {
  return (
    <form
      action={withdrawVenue}
      onSubmit={(event) => {
        if (!window.confirm(copy.sheet.confirmWithdraw)) event.preventDefault()
      }}
    >
      <input type="hidden" name="venueId" value={venueId} />
      <Button type="submit" variant="secondary" size="sm">
        {copy.sheet.withdraw}
      </Button>
    </form>
  )
}

export function DeleteReviewForm({ venueId, slug }: { venueId: string; slug: string }) {
  return (
    <form
      action={deleteVenueReview}
      onSubmit={(event) => {
        if (!window.confirm(copy.reviews.confirmDelete)) event.preventDefault()
      }}
    >
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant="secondary" size="sm">
        {copy.reviews.delete}
      </Button>
    </form>
  )
}
