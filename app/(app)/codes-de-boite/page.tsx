import type { Metadata } from 'next'

import { Band } from '@/components/band/band'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { readCode } from '@/lib/boxcode/decode'
import { m } from '@/lib/i18n'
import { listBoxCodes, type BoxCode } from '@/lib/referential/queries'

export const metadata: Metadata = { title: m.boxCodes.title }

const copy = m.boxCodes

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function monthName(month: number): string {
  const names = copy.monthNames as Record<string, string>
  return names[String(month)] ?? String(month)
}

/**
 * Le décodeur — F6 of the brief, and the smallest feature in it that can lie.
 *
 * A `<form method="get">`, so a decoded code is a URL: shareable, bookmarkable,
 * back-button correct, and zero JavaScript. Same rule as the faceted search.
 *
 * The design decision worth defending is what it does with a letter group it
 * does not know. It says "non reconnu" and stops. The tempting alternative —
 * "probablement une usine" — would be wrong in a specific way: Habanos
 * deliberately reshuffled the factory codes more than once, `PROVENANCE.md`
 * rates our six of them *faible*, and a decoder that dresses a low-confidence
 * guess in the same typography as a high-confidence month is how somebody ends
 * up telling a buyer their box is from El Laguito.
 *
 * For the same reason the twelve months are shown with their meaning and the
 * six factories with their caveat attached, rather than in one undifferentiated
 * table. The uncertainty travels with the row.
 */
export default async function BoxCodesPage({ searchParams }: Props) {
  const query = await searchParams
  const raw = (one(query.code) ?? '').slice(0, 40)

  const [codes] = await Promise.all([listBoxCodes()])

  const months = codes.filter((row) => row.kind === 'month')
  const factories = codes.filter((row) => row.kind === 'factory')

  const reading = raw.trim() === '' ? null : readCode(raw)

  const byCode = new Map(codes.map((row) => [row.code.toUpperCase(), row]))
  const matched = reading
    ? reading.letters.map((letters) => ({ letters, row: byCode.get(letters) ?? null }))
    : []

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{copy.inputLabel}</Label>
          <Input
            id="code"
            name="code"
            defaultValue={raw}
            placeholder={copy.inputPlaceholder}
            maxLength={40}
            className="w-64 font-mono uppercase"
          />
        </div>
        <Button type="submit">{copy.decode}</Button>
      </form>

      {reading === null ? (
        <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border px-4 py-4">
          <p className="eyebrow">{copy.emptyTitle}</p>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.emptyBody}</p>
        </div>
      ) : reading.empty ? (
        <div className="border-rule bg-surface flex flex-col gap-2 rounded-[3px] border px-4 py-4">
          <p className="eyebrow">{copy.nothingTitle}</p>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.nothingBody}</p>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{copy.resultTitle}</h2>

          <dl className="flex flex-col gap-3">
            {matched.map(({ letters, row }) => (
              <Reading key={letters} letters={letters} row={row} />
            ))}

            {reading.year ? (
              <div className="border-rule flex flex-col gap-1 border-b pb-3 last:border-0">
                <dt className="eyebrow">{copy.year}</dt>
                <dd className="text-ink text-lg">{reading.year.value}</dd>
                {reading.year.ambiguous ? (
                  <dd className="text-ink-muted measure text-xs leading-relaxed">
                    {copy.yearAmbiguous
                      .replace('{year}', String(reading.year.value))
                      .replace('{other}', String(reading.year.value - 100))}
                  </dd>
                ) : null}
              </div>
            ) : null}

            {reading.otherDigits.length > 0 ? (
              <div className="border-rule flex flex-col gap-1 border-b pb-3 last:border-0">
                <dt className="eyebrow">{copy.otherDigits}</dt>
                <dd className="text-ink font-mono">{reading.otherDigits.join(' · ')}</dd>
                <dd className="text-ink-muted measure text-xs leading-relaxed">
                  {copy.otherDigitsHint}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      )}

      <div className="border-rule rounded-[3px] border border-dashed px-4 py-4">
        <p className="eyebrow">{copy.caveatTitle}</p>
        <p className="text-ink-muted measure mt-2 text-sm leading-relaxed">{copy.caveatBody}</p>
      </div>

      <Band variant="divider" />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl">{copy.tableTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.tableLede}</p>
        </div>

        <div>
          <p className="eyebrow mb-2">{copy.kindMonth}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {months.map((row) => (
              <li key={row.code} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono w-12">{row.code}</span>
                <span className="text-ink-muted">
                  {row.month === null ? copy.kindMonth : monthName(row.month)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-2">{copy.kindFactory}</p>
          <ul className="flex flex-col gap-2">
            {factories.map((row) => (
              <li key={row.code} className="flex flex-col gap-0.5 text-sm">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono w-12">{row.code}</span>
                  <span className="text-ink-muted">{row.factory_code ?? '—'}</span>
                </span>
                {row.notes ? (
                  <span className="text-ink-faint measure pl-15 text-xs leading-relaxed">
                    {row.notes}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}

/**
 * One letter group, and what we are prepared to say about it.
 *
 * Three outcomes, and the third is the one that matters: a month (certain), a
 * factory (with its caveat attached to it, not in a footnote), or nothing at
 * all. Nothing at all is a result, and it is rendered as one.
 */
function Reading({ letters, row }: { letters: string; row: BoxCode | null }) {
  if (row?.kind === 'month' && row.month !== null) {
    return (
      <div className="border-rule flex flex-col gap-1 border-b pb-3 last:border-0">
        <dt className="eyebrow">{copy.month}</dt>
        <dd className="text-ink text-lg">
          <span className="font-mono">{letters}</span> — {monthName(row.month)}
        </dd>
      </div>
    )
  }

  if (row?.kind === 'factory') {
    return (
      <div className="border-rule flex flex-col gap-1 border-b pb-3 last:border-0">
        <dt className="eyebrow">{copy.factory}</dt>
        <dd className="text-ink text-lg">
          <span className="font-mono">{letters}</span> — {row.factory_code ?? '—'}
        </dd>
        <dd className="text-ink-muted measure text-xs leading-relaxed">
          {copy.factoryUnverified}
        </dd>
      </div>
    )
  }

  return (
    <div className="border-rule flex flex-col gap-1 border-b pb-3 last:border-0">
      <dt className="eyebrow">{copy.unknownLetters}</dt>
      <dd className="text-ink-muted text-lg">
        <span className="font-mono">{letters}</span>
      </dd>
      <dd className="text-ink-muted measure text-xs leading-relaxed">
        {copy.unknownLettersHint}
      </dd>
    </div>
  )
}
