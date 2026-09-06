// useActionState — a flag refusal (bad hours, not an admin) must appear next
// to the flag it concerns, and the row survives the write, so returned state
// has somewhere to live (unlike the sheet actions, which navigate).
'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select } from '@/components/ui/field'
import { isKnownFlag, PAYLOAD_FIELDS } from '@/lib/admin/flags'
import { formatDateTime } from '@/lib/format'
import { m } from '@/lib/i18n'

import { setFlag, type AdminState } from '../actions'

const copy = m.admin.flagsScreen
const flagCopy = m.admin.flags

/**
 * One flag, one form.
 *
 * The toggle is a submit button, not a checkbox: React 19 resets a form to its
 * mount-time `defaultChecked` after the action returns, and a checkbox that
 * silently snaps back is exactly the scope-selector bug. A button carries no
 * state to lie about — the page re-renders with the new truth, and the inputs
 * are keyed on the stored value so a saved payload becomes the new default.
 */
export function FlagForm({
  flagKey,
  enabled,
  payload,
  updatedAt,
  label,
  description,
  warning,
}: {
  flagKey: string
  enabled: boolean
  payload: Record<string, unknown>
  updatedAt: string
  label: string
  description: string
  warning?: string
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(setFlag, {})
  const field = isKnownFlag(flagKey) ? PAYLOAD_FIELDS[flagKey] : undefined

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={flagKey} />
      {/* The submit decides the direction: one button, opposite of the state. */}
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{label}</p>
        <span className={`eyebrow ${enabled ? 'text-accent' : 'text-ink-faint'}`}>
          {enabled ? copy.stateOn : copy.stateOff}
        </span>
      </div>
      <p className="text-ink-muted measure text-sm leading-relaxed">{description}</p>
      {warning ? (
        <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
          {warning}
        </p>
      ) : null}

      {field?.kind === 'hours' ? (
        <div className="flex max-w-48 flex-col gap-1.5">
          <Label htmlFor={`${flagKey}-hours`}>
            {(flagCopy.dsa_report_sla_hours as { hoursLabel: string }).hoursLabel}
          </Label>
          <Input
            id={`${flagKey}-hours`}
            name="hours"
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            defaultValue={String(payload[field.key] ?? '')}
            key={`hours-${String(payload[field.key] ?? '')}`}
          />
        </div>
      ) : null}

      {field?.kind === 'role' ? (
        <div className="flex max-w-48 flex-col gap-1.5">
          <Label htmlFor={`${flagKey}-role`}>
            {(flagCopy.comments_min_role as { roleLabel: string }).roleLabel}
          </Label>
          <Select
            id={`${flagKey}-role`}
            name="minRole"
            defaultValue={String(payload[field.key] ?? '')}
            key={`role-${String(payload[field.key] ?? '')}`}
          >
            {field.roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{copy.saved}</FieldStatus> : null}

      <div className="flex flex-wrap items-baseline gap-3">
        <Button type="submit" variant={enabled ? 'secondary' : 'primary'} disabled={pending}>
          {enabled ? copy.turnOff : copy.turnOn}
        </Button>
        {field ? (
          /* Saving the payload without flipping the state: the submitter's own
             name/value rides in the FormData, and the action prefers it over
             the hidden field — no second form, no client wrapper. */
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={pending}
            name="enabledOverride"
            value={enabled ? 'true' : 'false'}
          >
            {copy.save}
          </Button>
        ) : null}
        <span className="text-ink-faint text-xs">
          {copy.updatedOn.replace('{date}', formatDateTime(new Date(updatedAt)))}
        </span>
      </div>
    </form>
  )
}
