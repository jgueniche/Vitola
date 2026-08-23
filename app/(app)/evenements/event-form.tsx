'use client'

import { useActionState } from 'react'

import { createEvent, type EventState } from '@/app/(app)/evenements/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { EVENT_KINDS, EVENT_LIMITS, type EventKind } from '@/lib/social/groups'
import type { VenueOption } from '@/lib/venues/queries'

const copy = m.events.create

const KIND_LABELS: Record<EventKind, string> = {
  degustation: m.events.kind.degustation,
  rencontre: m.events.kind.rencontre,
  visite: m.events.kind.visite,
  autre: m.events.kind.autre,
}

/**
 * Announcing an event, from the agenda or from a club's page.
 *
 * One component for both, and `clubId` is the only difference — which is what
 * makes a club event and a free-standing one refuse for the same reasons and
 * read the same way. The alternative was two forms drifting apart on the two
 * pages that would have owned them.
 *
 * The place is a referential venue when there is one, a free-text field
 * otherwise — P5 brought `events.venue_id`, and both read the same on the
 * announcement. The selector disappears with the Q6 flag: `venueOptions` comes
 * in empty and `location_text` carries on alone, exactly as before P5.
 *
 * `datetime-local` gives a wall clock with no zone. The server reads it as
 * Paris time — see `fromBrandZoneWallClock()` — because the alternative was
 * announcing a July evening two hours late, silently.
 */
export function EventForm({
  clubId,
  clubName,
  venueOptions = [],
}: {
  clubId?: string
  clubName?: string
  venueOptions?: readonly VenueOption[]
}) {
  const [state, action, pending] = useActionState<EventState, FormData>(createEvent, {})

  const idPrefix = clubId ? `club-${clubId}` : 'agenda'

  return (
    <form
      action={action}
      className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4"
    >
      <p className="eyebrow">{clubName ? copy.legendClub : copy.legend}</p>
      {clubId ? <input type="hidden" name="clubId" value={clubId} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-title`}>{copy.title}</Label>
        <Input
          id={`${idPrefix}-title`}
          name="title"
          maxLength={EVENT_LIMITS.titleMax}
          placeholder={copy.titlePlaceholder}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-kind`}>{copy.kind}</Label>
        <Select id={`${idPrefix}-kind`} name="kind" defaultValue={EVENT_KINDS[0]}>
          {EVENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-description`}>{copy.description}</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          maxLength={EVENT_LIMITS.descriptionMax}
          placeholder={copy.descriptionPlaceholder}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-starts`}>{copy.startsAt}</Label>
          <Input id={`${idPrefix}-starts`} name="startsAt" type="datetime-local" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-ends`}>{copy.endsAt}</Label>
          <Input id={`${idPrefix}-ends`} name="endsAt" type="datetime-local" />
        </div>
      </div>

      {venueOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-venue`}>{copy.venue}</Label>
          <Select id={`${idPrefix}-venue`} name="venueId" defaultValue="">
            <option value="">{copy.venueNone}</option>
            {venueOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-location`}>{copy.location}</Label>
        <Input
          id={`${idPrefix}-location`}
          name="location"
          maxLength={EVENT_LIMITS.locationMax}
          placeholder={copy.locationPlaceholder}
          aria-describedby={`${idPrefix}-place-note`}
        />
        <p id={`${idPrefix}-place-note`} className="text-ink-faint text-xs leading-relaxed">
          {m.events.placeNote}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-capacity`}>{copy.capacity}</Label>
        <Input
          id={`${idPrefix}-capacity`}
          name="capacity"
          type="number"
          inputMode="numeric"
          min={EVENT_LIMITS.capacityMin}
          max={EVENT_LIMITS.capacityMax}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{m.events.done.created}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
