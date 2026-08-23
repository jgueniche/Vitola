'use client'

import { useActionState } from 'react'

import { createEvent, type EventState } from '@/app/(app)/evenements/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { EVENT_KINDS, EVENT_LIMITS, type EventKind } from '@/lib/social/groups'

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
 * The place is a free-text field, and the note under it says why rather than
 * leaving a reader to think the site does not know about places: `events` has
 * no `venue_id`, P5 brings the referential, and a column nothing fills is what
 * ADR 0007 already refused for `posts`.
 *
 * `datetime-local` gives a wall clock with no zone. The server reads it as
 * Paris time — see `fromBrandZoneWallClock()` — because the alternative was
 * announcing a July evening two hours late, silently.
 */
export function EventForm({ clubId, clubName }: { clubId?: string; clubName?: string }) {
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
