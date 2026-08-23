// useActionState — every one of these can be refused by a constraint the member
// can act on (a pseudo already taken, a country in the wrong shape), and a
// refusal has to appear beside the field that caused it.
'use client'

import { useRouter } from 'next/navigation'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import type { Preferences, Privacy } from '@/lib/settings/model'

import { savePreferences, savePrivacy, saveProfile, type SettingsState } from './actions'

const copy = m.settings

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) return <FieldError>{state.error}</FieldError>
  if (state.done) return <FieldStatus>{copy.saved}</FieldStatus>
  return null
}

/** A checkbox with its explanation under it, which is where it gets read. */
function Check({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint?: string
  defaultChecked: boolean
}) {
  return (
    /*
     * Keyed on the stored value, like the notebook's scope radios. React 19
     * resets a form after its action returns and restores each field the
     * `defaultChecked` it had *at mount* — so a box whose stored value has since
     * changed silently reverts, and it is the DOM that the next submit posts.
     */
    <label className="flex items-start gap-2 text-sm" key={`${name}-${String(defaultChecked)}`}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="accent-accent mt-0.5"
      />
      <span>
        {label}
        {hint ? <span className="text-ink-muted block text-xs leading-relaxed">{hint}</span> : null}
      </span>
    </label>
  )
}

export function ProfileForm({
  handle,
  displayName,
  bio,
  country,
  city,
  isDiscoverable,
}: {
  handle: string
  displayName: string | null
  bio: string | null
  country: string | null
  city: string | null
  isDiscoverable: boolean
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handle">{copy.handle}</Label>
        <Input id="handle" name="handle" required defaultValue={handle} maxLength={30} />
        <p className="text-ink-muted text-xs leading-relaxed">{copy.handleHint}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">{copy.displayName}</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={displayName ?? ''}
            maxLength={60}
          />
          <p className="text-ink-muted text-xs">{copy.displayNameHint}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="city">{copy.city}</Label>
          <Input id="city" name="city" defaultValue={city ?? ''} maxLength={80} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="country">{copy.country}</Label>
        <Input
          id="country"
          name="country"
          defaultValue={country ?? ''}
          maxLength={2}
          className="w-24 uppercase"
        />
        <p className="text-ink-muted text-xs">{copy.countryHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">{copy.bio}</Label>
        <Textarea id="bio" name="bio" defaultValue={bio ?? ''} maxLength={400} />
        <p className="text-ink-muted text-xs">{copy.bioHint}</p>
      </div>

      <Check
        name="isDiscoverable"
        label={copy.isDiscoverable}
        hint={copy.isDiscoverableHint}
        defaultChecked={isDiscoverable}
      />

      <Feedback state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}

export function PreferencesForm({ preferences }: { preferences: Preferences }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    savePreferences,
    {},
  )

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scoreScale">{copy.scoreScale}</Label>
          <Select
            id="scoreScale"
            name="scoreScale"
            defaultValue={String(preferences.score_scale)}
            key={`scale-${preferences.score_scale}`}
          >
            <option value="100">{copy.hundred}</option>
            <option value="20">{copy.twenty}</option>
          </Select>
          <p className="text-ink-muted text-xs leading-relaxed">{copy.scoreScaleHint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lengthUnit">{copy.lengthUnit}</Label>
          <Select
            id="lengthUnit"
            name="lengthUnit"
            defaultValue={preferences.length_unit}
            key={`unit-${preferences.length_unit}`}
          >
            <option value="mm">{copy.mm}</option>
            <option value="in">{copy.inch}</option>
          </Select>
        </div>
      </div>

      <Check
        name="emailDigest"
        label={copy.emailDigest}
        hint={copy.emailDigestHint}
        defaultChecked={preferences.email_digest}
      />

      <Feedback state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}

export function PrivacyForm({ privacy }: { privacy: Privacy }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePrivacy, {})

  return (
    <form action={action} className="flex flex-col gap-4">
      <Check
        name="showHumidor"
        label={copy.showHumidor}
        hint={copy.showHumidorHint}
        defaultChecked={privacy.show_humidor}
      />
      <Check name="showReviews" label={copy.showReviews} defaultChecked={privacy.show_reviews} />
      <Check name="showCountry" label={copy.showCountry} defaultChecked={privacy.show_country} />

      <Feedback state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}

/**
 * Erasure (art. 17), behind a confirmation and a POST.
 *
 * A route rather than a Server Action, because the endpoint already exists and
 * is the one §2 requires be reachable by a machine as well as by a person. The
 * dialog is `window.confirm` for the same reason the notebook's delete uses it:
 * this cascades through six tables and there is no undo.
 */
export function DeleteAccountButton() {
  const router = useRouter()
  const [state, action, pending] = useActionState<SettingsState, FormData>(async () => {
    const response = await fetch('/api/gdpr/delete', { method: 'POST' })
    if (!response.ok) return { error: copy.deleteFailed }
    /* `router.push` and not `window.location`: the session is gone, and the
       landing page is the only place left that means anything. `refresh()`
       after it, so the header stops showing a member who no longer exists. */
    router.push('/')
    router.refresh()
    return { done: true }
  }, {})

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(copy.deleteConfirm)) event.preventDefault()
      }}
    >
      <Button type="submit" variant="secondary" disabled={pending}>
        {copy.deleteAction}
      </Button>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
    </form>
  )
}
