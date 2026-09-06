// useActionState — a proposal can be refused for something the contributor can
// fix (a country in the wrong shape, nothing actually changed), and the refusal
// must appear without losing what they typed.
'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { STRENGTHS, strengthLabel, type Strength } from '@/components/data/strength-meter'
import { WRAPPER_SHADES, shadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { Button } from '@/components/ui/button'
import { FieldError, FieldStatus, Input, Label, Select, Textarea } from '@/components/ui/field'
import type { AromaFamily } from '@/lib/aromas/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { Constants } from '@/lib/supabase/database.types'

import { proposeRevision, type WikiState } from '../../../contributions/actions'

const copy = m.contributions

export type Current = {
  commercial_name: string
  vitola_id: string | null
  line_id: string | null
  origin_country: string | null
  wrapper_origin: string | null
  binder_origin: string | null
  filler_origins: string[]
  wrapper_shade: string | null
  strength: string | null
  release_type: string
  release_year: number | null
  discontinued_year: number | null
  aroma_tags: number[]
}

/**
 * The proposal form: the sheet's current values, editable.
 *
 * Pre-filled with what the sheet holds rather than left blank, and that is the
 * decision the whole screen rests on. A blank form asks somebody to retype nine
 * correct fields to fix the tenth, and `buildDiff()` would then have to guess
 * which of the nine they meant to clear. Pre-filled, an untouched field
 * produces no diff entry at all, and the action refuses a proposal that
 * proposes nothing — with a sentence rather than a 23514.
 *
 * Every control is native. A vitola picker over 51 rows is a `<select>`; a list
 * of origins is a comma-separated text field, which is what somebody copying
 * from a catalogue types anyway.
 */
export function ProposeForm({
  cigarId,
  slug,
  current,
  vitolas,
  lines,
  families,
}: {
  cigarId: string
  slug: string
  current: Current
  vitolas: { id: string; name_salida: string; length_mm: number; ring_gauge: number }[]
  lines: { id: string; name: string }[]
  families: AromaFamily[]
}) {
  const [state, action, pending] = useActionState<WikiState, FormData>(proposeRevision, {})

  /* A `<select>` always submits, so it only renders when every choice it
     offers is real: published lines of this brand, plus the sheet's current
     line when it is one of them. A sheet pointing at a line the list cannot
     name (unpublished since) gets the sentence instead — an untouched submit
     would otherwise propose CLEARING the line, silently. */
  const canProposeLine =
    lines.length > 0 && (current.line_id === null || lines.some((l) => l.id === current.line_id))

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="cigarId" value={cigarId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="commercial_name">{copy.fieldCommercialName}</Label>
        <Input
          id="commercial_name"
          name="commercial_name"
          defaultValue={current.commercial_name}
          maxLength={120}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vitola_id">{copy.fieldVitolaId}</Label>
        <Select
          id="vitola_id"
          name="vitola_id"
          defaultValue={current.vitola_id ?? ''}
          key={`vitola-${current.vitola_id ?? 'none'}`}
        >
          <option value="">{copy.noVitola}</option>
          {vitolas.map((vitola) => (
            <option key={vitola.id} value={vitola.id}>
              {vitola.name_salida} — {vitola.ring_gauge} × {vitola.length_mm} mm
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* A <label> without a control is not a label — the sentence branch
            titles itself with a plain element. */}
        {canProposeLine ? (
          <Label htmlFor="line_id">{copy.fieldLineId}</Label>
        ) : (
          <p className="eyebrow">{copy.fieldLineId}</p>
        )}
        {canProposeLine ? (
          <Select
            id="line_id"
            name="line_id"
            defaultValue={current.line_id ?? ''}
            key={`line-${current.line_id ?? 'none'}`}
          >
            <option value="">{copy.noLine}</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-ink-muted text-xs leading-relaxed">{copy.noLinePublished}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Country
          id="origin_country"
          label={copy.fieldOriginCountry}
          value={current.origin_country}
        />
        <Country
          id="wrapper_origin"
          label={copy.fieldWrapperOrigin}
          value={current.wrapper_origin}
        />
        <Country id="binder_origin" label={copy.fieldBinderOrigin} value={current.binder_origin} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filler_origins">{copy.fieldFillerOrigins}</Label>
        <Input
          id="filler_origins"
          name="filler_origins"
          defaultValue={current.filler_origins.join(', ')}
          className="uppercase"
        />
        <p className="text-ink-muted text-xs">{copy.fieldFillerOriginsHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="aroma_tags">{copy.fieldAromaTags}</Label>
        {/* A native multi-select over the wheel, grouped by family: the same
            rule as the vitola picker — the platform control is the one that
            is keyboard-correct. The hidden empty field is what makes "nothing
            selected" a submitted value, so a profile can be cleared. */}
        <input type="hidden" name="aroma_tags" value="" />
        <select
          id="aroma_tags"
          name="aroma_tags"
          multiple
          size={10}
          defaultValue={current.aroma_tags.map(String)}
          key={`aromas-${current.aroma_tags.join('-')}`}
          className="border-rule-strong bg-surface text-ink focus:border-accent w-full rounded-[3px] border px-3 py-2 text-sm focus:outline-none"
        >
          {families.map((family) => (
            <optgroup key={family.id} label={family.label}>
              {family.descriptors.map((descriptor) => (
                <option key={descriptor.id} value={descriptor.id}>
                  {descriptor.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-ink-muted text-xs">{copy.fieldAromaTagsHint}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="strength">{copy.fieldStrength}</Label>
          <Select
            id="strength"
            name="strength"
            defaultValue={current.strength ?? ''}
            key={`strength-${current.strength ?? 'none'}`}
          >
            <option value="">{copy.emptyValue}</option>
            {STRENGTHS.map((value) => (
              <option key={value} value={value}>
                {strengthLabel(value as Strength)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wrapper_shade">{copy.fieldWrapperShade}</Label>
          <Select
            id="wrapper_shade"
            name="wrapper_shade"
            defaultValue={current.wrapper_shade ?? ''}
            key={`shade-${current.wrapper_shade ?? 'none'}`}
          >
            <option value="">{copy.emptyValue}</option>
            {WRAPPER_SHADES.map((value) => (
              <option key={value} value={value}>
                {shadeLabel(value as WrapperShade)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release_type">{copy.fieldReleaseType}</Label>
          <Select
            id="release_type"
            name="release_type"
            defaultValue={current.release_type}
            key={`release-${current.release_type}`}
          >
            {Constants.ref.Enums.release_type.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release_year">{copy.fieldReleaseYear}</Label>
          <Input
            id="release_year"
            name="release_year"
            type="number"
            inputMode="numeric"
            defaultValue={current.release_year ?? ''}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discontinued_year">{copy.fieldDiscontinuedYear}</Label>
          <Input
            id="discontinued_year"
            name="discontinued_year"
            type="number"
            inputMode="numeric"
            defaultValue={current.discontinued_year ?? ''}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comment">{copy.proposeComment}</Label>
        <Textarea id="comment" name="comment" maxLength={1000} />
        <p className="text-ink-muted text-xs leading-relaxed">{copy.proposeCommentHint}</p>
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.done ? (
        <div className="flex flex-col gap-2">
          <FieldStatus>{copy.proposed}</FieldStatus>
          <Link href={routes.contributions()} className="text-accent w-fit text-sm underline">
            {copy.openProposal}
          </Link>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {copy.propose}
        </Button>
      </div>
    </form>
  )
}

function Country({ id, label, value }: { id: string; label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} defaultValue={value ?? ''} maxLength={2} className="uppercase" />
    </div>
  )
}
