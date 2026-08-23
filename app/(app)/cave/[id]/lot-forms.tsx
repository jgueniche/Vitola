// useActionState throughout — every one of these can be refused by the database
// (not enough left, a lot that is not yours) and the refusal has to appear next
// to the control that caused it rather than as a page that lost the context.
'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { ScopeSelector } from '@/components/reviews/scope-selector'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import { HUMIDOR_LIMITS } from '@/lib/humidor/model'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import {
  deleteLot,
  moveLot,
  recordEvent,
  smokeFromLot,
  type HumidorState,
} from '../actions'

const copy = m.humidor

/**
 * The gesture P2's exit criterion is about: one lot, one cigar less, one entry.
 *
 * The scope selector is the notebook's own component, with its four options and
 * its warnings, rather than a "publier" checkbox invented here. ADR 0006 D2 is
 * explicit that the humidor opens no door the notebook closes, and reusing the
 * control is how that stops being a promise and starts being a fact.
 *
 * The note and the word are both optional, and the placeholder says what that
 * means: with neither, nothing enters the notebook and the ledger event is the
 * whole record. Requiring one would produce invented ratings or unrecorded
 * cigars, and neither of those is an inventory.
 */
export function SmokeForm({
  itemId,
  slug,
  today,
  max,
}: {
  itemId: string
  slug: string | null
  today: string
  max: number
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(smokeFromLot, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="itemId" value={itemId} />
      {slug ? <input type="hidden" name="slug" value={slug} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`smoke-qty-${itemId}`}>{copy.qty}</Label>
          <Input
            id={`smoke-qty-${itemId}`}
            name="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            defaultValue={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`smoke-date-${itemId}`}>{copy.smokeDate}</Label>
          <Input id={`smoke-date-${itemId}`} name="occurredOn" type="date" defaultValue={today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`smoke-score-${itemId}`}>{copy.smokeScore}</Label>
          <Input
            id={`smoke-score-${itemId}`}
            name="score"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`smoke-body-${itemId}`}>{copy.smokeBody}</Label>
        <Textarea
          id={`smoke-body-${itemId}`}
          name="body"
          maxLength={4000}
          placeholder={copy.smokeBodyPlaceholder}
        />
      </div>

      <ScopeSelector pendingShares />

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? (
        <p className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
          {state.id ? copy.smokeDoneWithEntry : copy.smokeDone}
          {state.id ? (
            <Link href={routes.notebookEntry(state.id)} className="text-accent underline">
              {copy.openEntry}
            </Link>
          ) : null}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.smoke}
        </Button>
      </div>
    </form>
  )
}

/**
 * Everything that moves stock without being smoked.
 *
 * `smoke` is absent from the list on purpose: it belongs to the form above,
 * which alone can pair it with a notebook entry. Offering it twice would be
 * offering a way to lose the link that P2's exit criterion is about.
 */
export function EventForm({
  itemId,
  humidorId,
  today,
}: {
  itemId: string
  humidorId: string
  today: string
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(recordEvent, {})

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="humidorId" value={humidorId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`event-type-${itemId}`}>{copy.eventType}</Label>
          <Select id={`event-type-${itemId}`} name="type" defaultValue="gift">
            <option value="gift">{copy.eventGift}</option>
            <option value="loss">{copy.eventLoss}</option>
            <option value="adjust">{copy.eventAdjust}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`event-qty-${itemId}`}>{copy.qty}</Label>
          <Input
            id={`event-qty-${itemId}`}
            name="qty"
            type="number"
            inputMode="numeric"
            min={-HUMIDOR_LIMITS.qtyMax}
            max={HUMIDOR_LIMITS.qtyMax}
            defaultValue={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`event-date-${itemId}`}>{copy.eventDate}</Label>
          <Input id={`event-date-${itemId}`} name="occurredOn" type="date" defaultValue={today} />
        </div>
      </div>

      <p className="text-ink-muted text-xs">{copy.eventAdjustHint}</p>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.eventRecorded}</FieldStatus> : null}

      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {copy.eventRecord}
        </Button>
      </div>
    </form>
  )
}

/** Moving a lot is an update of its humidor; the ledger line is a trigger's. */
export function MoveForm({
  itemId,
  humidors,
  currentId,
}: {
  itemId: string
  humidors: { id: string; name: string }[]
  currentId: string
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(moveLot, {})
  const others = humidors.filter((humidor) => humidor.id !== currentId)
  if (others.length === 0) return null

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`move-${itemId}`}>{copy.moveTo}</Label>
        <Select id={`move-${itemId}`} name="humidorId" defaultValue={others[0]?.id}>
          {others.map((humidor) => (
            <option key={humidor.id} value={humidor.id}>
              {humidor.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {copy.move}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.moved}</FieldStatus> : null}
    </form>
  )
}

/**
 * Deleting a lot, behind a confirmation.
 *
 * `window.confirm` for the same reason the notebook's delete uses it: the row
 * takes its whole ledger with it, and a cascade that happens on one click is
 * one nobody meant. Not `useActionState` — there is nothing to show afterwards,
 * the row is gone.
 */
export function DeleteLotForm({ itemId, humidorId }: { itemId: string; humidorId: string }) {
  return (
    <form
      action={deleteLot}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteLotConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="humidorId" value={humidorId} />
      <Button type="submit" variant="ghost" size="sm">
        {copy.deleteLot}
      </Button>
    </form>
  )
}
