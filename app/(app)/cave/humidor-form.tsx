// useActionState — a refusal is shown where it happened, and the fields keep
// what was typed rather than making someone retype a cave they just described.
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label } from '@/components/ui/field'
import { HUMIDOR_LIMITS } from '@/lib/humidor/model'
import { m } from '@/lib/i18n'

import { createHumidor, updateHumidor, type HumidorState } from './actions'

const copy = m.humidor

export type HumidorDefaults = {
  id?: string
  name?: string
  capacity?: number | null
  targetRh?: number | null
  targetTemp?: number | null
  isDefault?: boolean
}

/**
 * One form for both gestures, because they are the same fields.
 *
 * The difference is which action it posts to and whether it carries an id, and
 * that is the whole of it — a second component would have been the same eighty
 * lines with a different verb, and the two would have drifted the first time a
 * field was added.
 */
export function HumidorForm({
  mode,
  defaults = {},
}: {
  mode: 'create' | 'edit'
  defaults?: HumidorDefaults
}) {
  const [state, action, pending] = useActionState<HumidorState, FormData>(
    mode === 'create' ? createHumidor : updateHumidor,
    {},
  )

  return (
    <form action={action} className="flex flex-col gap-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="humidor-name">{copy.name}</Label>
        <Input
          id="humidor-name"
          name="name"
          required
          maxLength={HUMIDOR_LIMITS.nameMax}
          defaultValue={defaults.name ?? ''}
          placeholder={copy.namePlaceholder}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="humidor-capacity">{copy.capacity}</Label>
          <Input
            id="humidor-capacity"
            name="capacity"
            type="number"
            inputMode="numeric"
            min={HUMIDOR_LIMITS.capacityMin}
            max={HUMIDOR_LIMITS.capacityMax}
            defaultValue={defaults.capacity ?? ''}
          />
          <p className="text-ink-muted text-xs">{copy.capacityHint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="humidor-rh">{copy.targetRh}</Label>
          <Input
            id="humidor-rh"
            name="targetRh"
            type="number"
            step="0.5"
            min={HUMIDOR_LIMITS.rhMin}
            max={HUMIDOR_LIMITS.rhMax}
            defaultValue={defaults.targetRh ?? ''}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="humidor-temp">{copy.targetTemp}</Label>
          <Input
            id="humidor-temp"
            name="targetTemp"
            type="number"
            step="0.5"
            min={HUMIDOR_LIMITS.tempMin}
            max={HUMIDOR_LIMITS.tempMax}
            defaultValue={defaults.targetTemp ?? ''}
          />
        </div>
      </div>

      {/*
        Keyed on the value it comes from, like the notebook's scope radios.
        React 19 resets a form after its action returns and restores each field
        the `defaultChecked` it had *at mount* — so a box that has since changed
        server-side silently reverts, and it is the DOM that the next submit
        posts. The key remounts it instead.
      */}
      <label className="flex items-start gap-2 text-sm" key={String(defaults.isDefault)}>
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={defaults.isDefault ?? false}
          className="accent-accent mt-0.5"
        />
        <span>
          {copy.isDefault}
          <span className="text-ink-muted block text-xs">{copy.isDefaultHint}</span>
        </span>
      </label>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? (
        <FieldStatus>{mode === 'create' ? copy.created : copy.saved}</FieldStatus>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {mode === 'create' ? copy.create : copy.save}
        </Button>
      </div>
    </form>
  )
}
