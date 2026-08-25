import type { Metadata } from 'next'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { listAllLines, listBrandOptions } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { setLineStatus } from '../actions'
import { AdminRestricted, adminView } from '../shell'
import { CreateLineForm, DeleteLineForm } from './line-forms'

export const metadata: Metadata = { title: m.admin.lines.title }

const copy = m.admin.lines

const CONFIRMATIONS: Record<string, string> = {
  'gamme-publiee': m.admin.confirmations.gammePubliee,
  'gamme-depubliee': m.admin.confirmations.gammeDepubliee,
  'gamme-supprimee': m.admin.confirmations.gammeSupprimee,
  refus: m.admin.confirmations.refus,
}

/**
 * The lines — the editor's arm that 0019 announced.
 *
 * A line is born a draft here (the insert does not set a status, the default
 * is the safety direction) and publishing is the separate, visible gesture.
 * Attaching sheets to it stays the wiki's job, one proposal at a time — mass
 * attachment is exactly what ADR 0009 forbids.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminLinesPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminLines())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined

  const [lines, brands] = await Promise.all([listAllLines(), listBrandOptions()])

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.admin.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
        <h2 className="font-display text-2xl">{copy.createTitle}</h2>
        <CreateLineForm brands={brands} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{copy.listTitle}</h2>
        {lines.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li
                key={line.id}
                className="border-rule bg-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[3px] border px-4 py-3"
              >
                <span className="flex flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{line.name}</span>
                    {line.brands?.name ? (
                      <span className="text-ink-muted text-sm">{line.brands.name}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-faint text-xs">
                    {line.status === 'published' ? copy.statusPublished : copy.statusDraft}
                    {' · '}
                    {line.slug}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <form action={setLineStatus}>
                    <input type="hidden" name="id" value={line.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={line.status === 'published' ? 'draft' : 'published'}
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      {line.status === 'published' ? copy.unpublish : copy.publish}
                    </Button>
                  </form>
                  <DeleteLineForm id={line.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
