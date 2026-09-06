import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { listSheets, SHEET_FILTERS, type SheetFilter } from '@/lib/admin/queries'
import { adminCounts } from '@/lib/admin/queries'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { actOnSheet } from '../actions'
import { AdminRestricted, adminView } from '../shell'

export const metadata: Metadata = { title: m.admin.sheets.title }

const copy = m.admin.sheets

const CONFIRMATIONS: Record<string, string> = {
  relue: m.admin.confirmations.relue,
  depubliee: m.admin.confirmations.depubliee,
  republiee: m.admin.confirmations.republiee,
  refus: m.admin.confirmations.refus,
}

const FILTER_LABELS: Record<SheetFilter, string> = {
  'non-relues': copy.filterUnreviewed,
  brouillons: copy.filterDrafts,
  publiees: copy.filterPublished,
}

/**
 * The review backlog — the screen that resorbs the 862 and, once empty,
 * triggers ADR 0008 (proposing entirely new sheets).
 *
 * Every action here is a session write under `cigars_update_editor`; the
 * action reads the written rows and carries the outcome in the URL, because
 * acting on a row removes it from the filtered list it was clicked in — the
 * form holding a returned state unmounts in the same render.
 *
 * Filters are links and the search a GET form: reloadable, shareable, and the
 * state survives every write (the /cave rule).
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminSheetsPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminSheets())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const rawFilter = typeof query.filtre === 'string' ? query.filtre : 'non-relues'
  const filter: SheetFilter = (SHEET_FILTERS as readonly string[]).includes(rawFilter)
    ? (rawFilter as SheetFilter)
    : 'non-relues'
  const q = typeof query.q === 'string' ? query.q : ''
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined

  const [sheets, counts] = await Promise.all([listSheets(filter, q), adminCounts()])

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.admin.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="eyebrow">
          {copy.countUnreviewed.replace('{count}', String(counts.sheetsUnreviewed))}
        </p>
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap gap-2" aria-label={copy.title}>
          {SHEET_FILTERS.map((value) => (
            <Link
              key={value}
              href={`${routes.adminSheets()}?filtre=${value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              aria-current={filter === value ? 'page' : undefined}
              className={`rounded-[3px] border px-3 py-1.5 text-sm ${
                filter === value
                  ? 'border-rule-strong text-ink bg-surface-raised'
                  : 'border-rule text-ink-muted hover:text-ink'
              }`}
            >
              {FILTER_LABELS[value]}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="filtre" value={filter} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="q">{copy.searchLabel}</Label>
            <Input id="q" name="q" defaultValue={q} />
          </div>
          <Button type="submit" variant="secondary">
            {copy.search}
          </Button>
        </form>
      </div>

      {sheets.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-2">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              className="border-rule bg-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[3px] border px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{sheet.commercial_name}</span>
                  {sheet.brands?.name ? (
                    <span className="text-ink-muted text-sm">{sheet.brands.name}</span>
                  ) : null}
                </span>
                <span className="text-ink-faint text-xs">
                  {sheet.status === 'published' ? copy.statusPublished : copy.statusDraft}
                  {' · '}
                  {sheet.verified_by && sheet.verified_at
                    ? copy.reviewedOn.replace(
                        '{date}',
                        formatEffectiveDate(sheet.verified_at.slice(0, 10)),
                      )
                    : copy.neverReviewed}
                  {' · '}
                  <Link href={routes.cigar(sheet.slug)} className="underline">
                    {copy.openSheet}
                  </Link>
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {sheet.verified_by === null ? (
                  <SheetAction
                    id={sheet.id}
                    verb="relire"
                    filtre={filter}
                    q={q}
                    label={copy.markReviewed}
                  />
                ) : null}
                {sheet.status === 'published' ? (
                  <SheetAction
                    id={sheet.id}
                    verb="depublier"
                    filtre={filter}
                    q={q}
                    label={copy.unpublish}
                  />
                ) : (
                  <SheetAction
                    id={sheet.id}
                    verb="republier"
                    filtre={filter}
                    q={q}
                    label={copy.republish}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function SheetAction({
  id,
  verb,
  filtre,
  q,
  label,
}: {
  id: string
  verb: 'relire' | 'depublier' | 'republier'
  filtre: string
  q: string
  label: string
}) {
  return (
    <form action={actOnSheet}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="verb" value={verb} />
      <input type="hidden" name="filtre" value={filtre} />
      <input type="hidden" name="q" value={q} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  )
}
