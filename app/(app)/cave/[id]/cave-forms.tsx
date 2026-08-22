// useActionState — each of these can be refused with something worth reading:
// an unknown slug in an imported file, a reading with neither figure, a lot the
// database declined. A refusal shown anywhere but here is one nobody acts on.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Textarea } from '@/components/ui/field'
import { HUMIDOR_LIMITS } from '@/lib/humidor/model'
import { m } from '@/lib/i18n'

import { addLot, addReading, deleteHumidor, importCsv, type HumidorState } from '../actions'

const copy = m.humidor

/**
 * Puts one cigar away.
 *
 * Only the quantity is required, and that is a decision rather than laziness:
 * the gesture this form exists for is "j'ai acheté ça", performed standing in
 * front of an open box. Eight compulsory fields would make the honest answer
 * be not to record it at all, and a humidor nobody fills is worse than one
 * missing a vendor name.
 *
 * `agingStartDate` sits next to `purchaseDate` because they differ often — a
 * box bought aged starts its rest before one owns it — and the derived age in
 * `humidor_inventory` prefers the former precisely for that case.
 */
export function AddLotForm({
  humidorId,
  cigarId,
  cigarName,
  today,
}: {
  humidorId: string
  cigarId: string
  cigarName: string
  today: string
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(addLot, {})

  return (
    <form action={action} className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
      <input type="hidden" name="humidorId" value={humidorId} />
      <input type="hidden" name="cigarId" value={cigarId} />

      <p className="eyebrow">{cigarName}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-qty">{copy.qty}</Label>
          <Input
            id="lot-qty"
            name="qty"
            type="number"
            inputMode="numeric"
            required
            min={HUMIDOR_LIMITS.qtyMin}
            max={HUMIDOR_LIMITS.qtyMax}
            defaultValue={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-purchase">{copy.purchaseDate}</Label>
          <Input id="lot-purchase" name="purchaseDate" type="date" defaultValue={today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-price">{copy.price}</Label>
          <Input id="lot-price" name="price" type="number" step="0.01" min={0} />
          <p className="text-ink-muted text-xs">{copy.priceHint}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-aging">{copy.agingStartDate}</Label>
          <Input id="lot-aging" name="agingStartDate" type="date" />
          <p className="text-ink-muted text-xs">{copy.agingStartHint}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-vendor">{copy.vendorName}</Label>
          <Input id="lot-vendor" name="vendorName" maxLength={HUMIDOR_LIMITS.vendorMax} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lot-box">{copy.boxCode}</Label>
          <Input id="lot-box" name="boxCode" maxLength={HUMIDOR_LIMITS.boxCodeMax} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lot-position">{copy.position}</Label>
        <Input
          id="lot-position"
          name="position"
          maxLength={HUMIDOR_LIMITS.positionMax}
          placeholder={copy.positionHint}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lot-notes">{copy.notes}</Label>
        <Textarea id="lot-notes" name="notes" maxLength={HUMIDOR_LIMITS.notesMax} />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.added}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.add}
        </Button>
      </div>
    </form>
  )
}

/**
 * One hygrometry reading.
 *
 * `source` is never sent: the column defaults to `manual`, and v1 has no door a
 * device could come through. Posting 'manual' by hand would dress a constraint
 * as a choice.
 */
export function ReadingForm({ humidorId }: { humidorId: string }) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(addReading, {})

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="humidorId" value={humidorId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reading-rh">{copy.rh}</Label>
        <Input
          id="reading-rh"
          name="rh"
          type="number"
          step="0.5"
          min={HUMIDOR_LIMITS.rhMin}
          max={HUMIDOR_LIMITS.rhMax}
          className="w-28"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reading-temp">{copy.tempC}</Label>
        <Input
          id="reading-temp"
          name="tempC"
          type="number"
          step="0.5"
          min={HUMIDOR_LIMITS.tempMin}
          max={HUMIDOR_LIMITS.tempMax}
          className="w-28"
        />
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {copy.addReading}
      </Button>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.readingAdded}</FieldStatus> : null}
    </form>
  )
}

/**
 * Reads an inventory file.
 *
 * A file input and nothing else. The action accepts a pasted string too — it
 * reads `formData.get('file')` as either — but offering a textarea beside the
 * picker would be two controls for one gesture, and the one people actually
 * perform is choosing the export their spreadsheet just produced.
 */
export function ImportForm({ humidorId }: { humidorId: string }) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(importCsv, {})

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="humidorId" value={humidorId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csv-file">{copy.csvImportLabel}</Label>
        <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" />
        <p className="text-ink-muted text-xs">{copy.csvImportHint}</p>
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.csvImported}</FieldStatus> : null}

      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {copy.csvImport}
        </Button>
      </div>
    </form>
  )
}

/** Deleting a cave takes its lots, its ledger and its readings with it. */
export function DeleteHumidorForm({ id }: { id: string }) {
  return (
    <form
      action={deleteHumidor}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        {copy.delete}
      </Button>
    </form>
  )
}
