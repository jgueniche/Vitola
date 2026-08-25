import { strengthLabel, type Strength } from '@/components/data/strength-meter'
import { shadeLabel, type WrapperShade } from '@/components/data/wrapper-scale'
import { countryLabel } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { fieldFor, type Diff, type DiffValue } from '@/lib/wiki/model'

const copy = m.contributions

const FIELD_LABELS: Record<string, string> = {
  commercial_name: copy.fieldCommercialName,
  vitola_id: copy.fieldVitolaId,
  line_id: copy.fieldLineId,
  origin_country: copy.fieldOriginCountry,
  wrapper_origin: copy.fieldWrapperOrigin,
  binder_origin: copy.fieldBinderOrigin,
  filler_origins: copy.fieldFillerOrigins,
  wrapper_shade: copy.fieldWrapperShade,
  strength: copy.fieldStrength,
  release_type: copy.fieldReleaseType,
  release_year: copy.fieldReleaseYear,
  discontinued_year: copy.fieldDiscontinuedYear,
}

export function fieldLabel(column: string): string {
  return FIELD_LABELS[column] ?? column
}

/**
 * One stored value, rendered as the thing it means.
 *
 * A diff holds columns, so `vitola_id` is a uuid and `wrapper_shade` is
 * `colorado_maduro`. Neither is readable, and a reviewer who cannot read a
 * proposal cannot review it. The labels come from the components that already
 * own them — `strengthLabel`, `shadeLabel`, `countryLabel` — rather than from a
 * second table here, which is the whole reason `shadeLabel` was exported.
 *
 * `release_type` has no label map anywhere yet, so it renders its raw enum
 * value. That is deliberately visible rather than prettified: an identifier
 * shown as an identifier invites somebody to write the seven French words,
 * where a `startCase()` would quietly look finished.
 */
export function DiffValueText({
  column,
  value,
  vitolaNames,
  lineNames,
}: {
  column: string
  value: DiffValue
  vitolaNames?: Map<string, string>
  lineNames?: Map<string, string>
}) {
  if (value === null) return <span className="text-ink-faint italic">{copy.emptyValue}</span>

  const field = fieldFor(column)

  if (field?.kind === 'vitola') {
    const name = vitolaNames?.get(String(value))
    return <span>{name ?? String(value)}</span>
  }
  /* Same fallback as the vitola: a uuid whose line the caller may not read
     (unpublished since) renders as itself rather than pretending to be empty. */
  if (field?.kind === 'line') {
    const name = lineNames?.get(String(value))
    return <span>{name ?? String(value)}</span>
  }
  if (field?.kind === 'country') return <span>{countryLabel(String(value))}</span>
  if (field?.kind === 'countryList') {
    const list = Array.isArray(value) ? value : [String(value)]
    return <span>{list.map((code) => countryLabel(code)).join(', ')}</span>
  }
  if (column === 'strength') return <span>{strengthLabel(String(value) as Strength)}</span>
  if (column === 'wrapper_shade') return <span>{shadeLabel(String(value) as WrapperShade)}</span>

  return <span>{String(value)}</span>
}

/**
 * A proposal, as a list of before → after.
 *
 * The `from` half is shown struck through rather than omitted, because the
 * question a reviewer is answering is not "is this value right" but "is this
 * change right" — and those differ whenever the current value is also
 * defensible.
 */
export function DiffView({
  diff,
  vitolaNames,
  lineNames,
}: {
  diff: Diff
  vitolaNames?: Map<string, string>
  lineNames?: Map<string, string>
}) {
  const entries = Object.entries(diff)
  if (entries.length === 0) return null

  return (
    <dl className="flex flex-col gap-2">
      {entries.map(([column, entry]) => (
        <div key={column} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <dt className="eyebrow w-40 shrink-0">{fieldLabel(column)}</dt>
          <dd className="text-ink-faint line-through">
            <DiffValueText
              column={column}
              value={entry.from}
              vitolaNames={vitolaNames}
              lineNames={lineNames}
            />
          </dd>
          <dd aria-hidden="true" className="text-ink-faint">
            {copy.arrow}
          </dd>
          <dd className="text-ink">
            <DiffValueText
              column={column}
              value={entry.to}
              vitolaNames={vitolaNames}
              lineNames={lineNames}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}
