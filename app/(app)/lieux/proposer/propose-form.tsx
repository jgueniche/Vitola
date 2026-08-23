'use client'

// useActionState — a refused proposal re-renders in place without losing what
// was typed; success navigates to the new sheet. The position button reads the
// device's geolocation into two visible inputs: what will be sent is on screen.
import { useActionState, useState } from 'react'

import { proposeVenue, type VenueFormState } from '@/app/(app)/lieux/actions'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Select } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { HOURS_DAYS, VENUE_LIMITS, type VenueType } from '@/lib/venues/model'

const copy = m.venues.propose
const days = m.venues.sheet.days

function TriStateSelect({ id, name, label }: { id: string; name: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={name} defaultValue="unknown">
        <option value="unknown">{m.venues.tri.unknown}</option>
        <option value="yes">{m.venues.tri.yes}</option>
        <option value="no">{m.venues.tri.no}</option>
      </Select>
    </div>
  )
}

export function ProposeVenueForm({ offeredTypes }: { offeredTypes: readonly VenueType[] }) {
  const [state, formAction] = useActionState<VenueFormState, FormData>(proposeVenue, {})
  // Controlled from mount to unmount: an input that flips between controlled
  // and uncontrolled is the React warning that always means a real bug.
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [locating, setLocating] = useState<'idle' | 'locating' | 'failed'>('idle')

  function locate() {
    if (!('geolocation' in navigator)) {
      setLocating('failed')
      return
    }
    setLocating('locating')
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLat(result.coords.latitude.toFixed(5))
        setLng(result.coords.longitude.toFixed(5))
        setLocating('idle')
      },
      () => setLocating('failed'),
      { maximumAge: 60_000, timeout: 10_000 },
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-2xl">{copy.legend}</legend>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lieu-type">{copy.typeLabel}</Label>
            <Select id="lieu-type" name="type" defaultValue={offeredTypes[0]} required>
              {offeredTypes.map((value) => (
                <option key={value} value={value}>
                  {m.venues.types[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <Label htmlFor="lieu-name">{copy.nameLabel}</Label>
            <Input
              id="lieu-name"
              name="name"
              required
              minLength={VENUE_LIMITS.nameMin}
              maxLength={VENUE_LIMITS.nameMax}
              placeholder={copy.namePlaceholder}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="lieu-address">{copy.addressLabel}</Label>
          <Input
            id="lieu-address"
            name="address"
            maxLength={VENUE_LIMITS.addressMax}
            placeholder={copy.addressPlaceholder}
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label htmlFor="lieu-city">{copy.cityLabel}</Label>
            <Input id="lieu-city" name="city" required maxLength={VENUE_LIMITS.cityMax} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lieu-postal">{copy.postalLabel}</Label>
            <Input id="lieu-postal" name="postalCode" maxLength={VENUE_LIMITS.postalCodeMax} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lieu-phone">{copy.phoneLabel}</Label>
            <Input id="lieu-phone" name="phone" maxLength={VENUE_LIMITS.phoneMax} />
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <Label htmlFor="lieu-website">{copy.websiteLabel}</Label>
            <Input id="lieu-website" name="website" type="url" maxLength={200} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <TriStateSelect id="lieu-smoking" name="smoking" label={copy.smokingLabel} />
          <TriStateSelect id="lieu-ventilated" name="ventilated" label={copy.ventilatedLabel} />
        </div>
      </fieldset>

      <details className="border-rule rounded-[3px] border p-4">
        <summary className="cursor-pointer text-sm">{copy.hoursSummary}</summary>
        <p className="text-ink-muted mt-2 text-xs leading-relaxed">{copy.hoursHint}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {HOURS_DAYS.map((day) => (
            <div key={day} className="flex items-center gap-2">
              <Label htmlFor={`lieu-hours-${day}`} className="w-24 shrink-0">
                {days[day]}
              </Label>
              <Input
                id={`lieu-hours-${day}`}
                name={`hours-${day}`}
                maxLength={VENUE_LIMITS.hoursDayMax}
              />
            </div>
          ))}
        </div>
      </details>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-xl">{copy.positionLegend}</legend>
        <p className="text-ink-muted measure text-xs leading-relaxed">{copy.positionHint}</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lieu-lat">{copy.latLabel}</Label>
            <Input
              id="lieu-lat"
              name="lat"
              inputMode="decimal"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lieu-lng">{copy.lngLabel}</Label>
            <Input
              id="lieu-lng"
              name="lng"
              inputMode="decimal"
              value={lng}
              onChange={(event) => setLng(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={locate}
            disabled={locating === 'locating'}
          >
            {locating === 'locating' ? copy.locating : copy.useMyPosition}
          </Button>
          {lat || lng ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLat('')
                setLng('')
              }}
            >
              {copy.clearPosition}
            </Button>
          ) : null}
        </div>
        {locating === 'failed' ? <FieldError>{copy.locateFailed}</FieldError> : null}
      </fieldset>

      {state.error ? <FieldError>{state.error}</FieldError> : null}

      <div>
        <Button type="submit">{copy.submit}</Button>
      </div>
    </form>
  )
}
