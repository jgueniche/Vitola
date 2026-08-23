'use client'

// useActionState for the refusal, useState for the address: this is the one
// form in the section that shows a consequence while it is being typed.
import { useActionState, useState } from 'react'

import { createClub, type ClubState } from '@/app/(app)/clubs/actions'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Textarea } from '@/components/ui/field'
import { m } from '@/lib/i18n'
import { CLUB_LIMITS, clubSlug } from '@/lib/social/groups'

const copy = m.clubs.create

/**
 * Creating a club, with its address shown before it exists.
 *
 * That preview is the whole reason `clubSlug()` lives in TypeScript rather than
 * being left to `public.slugify()`: two clubs cannot share an address, and the
 * only moment at which that is worth knowing is while the name is being typed.
 * A round trip per keystroke would have been the other way, and it is not one.
 *
 * The preview is a promise about a format, not about availability. Two people
 * naming a club at the same second still collide, and the action reports it —
 * `clubs_slug_key` is the thing that decides, here as everywhere.
 */
export function ClubForm() {
  const [state, action, pending] = useActionState<ClubState, FormData>(createClub, {})
  const [name, setName] = useState('')

  const slug = clubSlug(name)

  return (
    <form
      action={action}
      className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4"
    >
      <p className="eyebrow">{copy.legend}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="club-name">{copy.name}</Label>
        <Input
          id="club-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={CLUB_LIMITS.nameMax}
          placeholder={copy.namePlaceholder}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="club-address"
        />
        <p id="club-address" className="text-ink-faint text-xs">
          {slug.length > 0 ? copy.addressPreview.replace('{slug}', slug) : copy.addressEmpty}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="club-description">{copy.description}</Label>
        <Textarea
          id="club-description"
          name="description"
          maxLength={CLUB_LIMITS.descriptionMax}
          placeholder={copy.descriptionPlaceholder}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? <FieldStatus>{m.clubs.done.created}</FieldStatus> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
