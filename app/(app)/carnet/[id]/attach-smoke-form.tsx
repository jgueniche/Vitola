// useActionState — the lot may have emptied since the page was rendered, and
// "il n'en reste que 0" has to appear on the control that was just pressed.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, Label, Select } from '@/components/ui/field'
import { m } from '@/lib/i18n'

import { attachSmokeToEntry, type HumidorState } from '../../cave/actions'

const copy = m.humidor

/**
 * Records the missing `smoke` event for an entry that was written outside the
 * humidor — a tasting, typically.
 *
 * One cigar, not a quantity: this closes a gap left by *one* tasting, and a
 * field offering to take three out would be inviting a correction rather than
 * a repair. Taking three out is a gesture the cave itself offers.
 */
export function AttachSmokeForm({
  reviewId,
  lots,
}: {
  reviewId: string
  lots: { id: string; qty: number; label: string }[]
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(attachSmokeToEntry, {})

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="qty" value="1" />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attach-lot">{copy.smokeLot}</Label>
        <Select id="attach-lot" name="itemId" defaultValue={lots[0]?.id}>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {copy.smokeLotOption
                .replace('{cigar}', lot.label)
                .replace('{count}', String(lot.qty))}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {copy.notLinkedAction}
      </Button>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <p className="text-ink-muted text-sm">{copy.smokeDone}</p> : null}
    </form>
  )
}
