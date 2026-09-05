import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { Label, Textarea } from '@/components/ui/field'
import { listProducts, listVendorOptions, type ProductRow } from '@/lib/admin/queries'
import { formatEffectiveDate } from '@/lib/cigar'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { refuseProduct, setProductStatus } from '../actions'
import { AdminRestricted, adminView } from '../shell'
import { CreateProductForm, DeleteProductForm, EditProductForm } from './product-forms'

export const metadata: Metadata = { title: m.admin.shop.title }

const copy = m.admin.shop

const CONFIRMATIONS: Record<string, string> = {
  'produit-publie': m.admin.confirmations.produitPublie,
  'produit-depublie': m.admin.confirmations.produitDepublie,
  'produit-archive': m.admin.confirmations.produitArchive,
  'produit-supprime': m.admin.confirmations.produitSupprime,
  'produit-refuse': m.admin.confirmations.produitRefuse,
  refus: m.admin.confirmations.refus,
}

const STATUS_LABELS: Record<string, string> = {
  draft: copy.statusDraft,
  published: copy.statusPublished,
  archived: copy.statusArchived,
}

const CATEGORY_LABELS = copy.categories as Record<string, string>

function statusLabel(product: ProductRow): string {
  if (product.status === 'draft' && product.submitted_at !== null) return copy.statusSubmitted
  return STATUS_LABELS[product.status] ?? product.status
}

/**
 * The catalogue, fed without a developer (ADR 0015), and since ADR 0016 the
 * review desk of the marketplace: vendor submissions land in a queue, oldest
 * first — the order of a queue — and leave it published or refused with a
 * reason the vendor reads.
 *
 * The open edit panel lives in the URL (`?produit=…`), because every write on
 * this page re-renders it and a panel held in a client component would close
 * under the admin's hands — the /cave rule. Status changes, refusals and
 * deletion navigate with the outcome (`?fait=…`); the two forms return state,
 * because their row survives.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminShopPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminShop())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined
  const openId = typeof query.produit === 'string' ? query.produit : null

  const [products, vendorOptions] = await Promise.all([listProducts(), listVendorOptions()])
  const open = openId ? (products.find((product) => product.id === openId) ?? null) : null
  const queue = products
    .filter((product) => product.status === 'draft' && product.submitted_at !== null)
    .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{m.admin.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        <p className="text-sm">
          <Link href={routes.adminShopVendors()} className="text-ink underline">
            {copy.vendorsLink}
          </Link>{' '}
          <span className="text-ink-faint text-xs">{copy.vendorsLede}</span>
          {' · '}
          <Link href={routes.shop()} className="text-ink underline">
            {copy.seePublic}
          </Link>
        </p>
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.queueTitle}</h2>
        {queue.length === 0 ? (
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.queueEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {queue.map((product) => (
              <li
                key={product.id}
                className="border-rule bg-surface flex flex-col gap-3 rounded-[3px] border px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-semibold">{product.title}</span>
                    <span className="text-ink-faint text-xs">
                      {product.vendor?.name ?? '—'}
                      {' · '}
                      {CATEGORY_LABELS[product.category] ?? product.category}
                      {' · '}
                      {copy.queueSubmittedOn.replace(
                        '{date}',
                        formatEffectiveDate((product.submitted_at ?? '').slice(0, 10)),
                      )}
                    </span>
                  </span>
                  <Link
                    href={`${routes.adminShop()}?produit=${product.id}`}
                    className="text-accent text-sm underline"
                  >
                    {copy.edit}
                  </Link>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <form action={setProductStatus}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="status" value="published" />
                    <Button type="submit">{copy.publish}</Button>
                  </form>
                  <form action={refuseProduct} className="flex grow flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={product.id} />
                    <div className="flex min-w-56 grow flex-col gap-1.5">
                      <Label htmlFor={`note-${product.id}`}>{copy.refuseNoteLabel}</Label>
                      <Textarea
                        id={`note-${product.id}`}
                        name="note"
                        rows={1}
                        maxLength={500}
                        required
                      />
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      {copy.refuse}
                    </Button>
                  </form>
                </div>
                <p className="text-ink-faint text-xs">{copy.refuseNoteHint}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open ? (
        <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-display-sm">{copy.editTitle}</h2>
            <Link href={routes.adminShop()} className="text-ink-muted text-sm underline">
              {copy.closePanel}
            </Link>
          </div>

          <p className="text-ink-faint text-xs">
            {copy.vendorLabel} : {open.vendor?.name ?? '—'} · {statusLabel(open)}
          </p>

          {open.imageUrl ? (
            /* signed URL, short-lived and remote: next/image would proxy and
               re-sign nothing. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={open.imageUrl}
              alt={open.title}
              className="border-rule max-h-48 w-fit rounded-[3px] border object-contain"
            />
          ) : (
            <p className="text-ink-faint text-xs">{copy.noImage}</p>
          )}

          <EditProductForm product={open} />

          <div className="border-rule flex flex-wrap items-center gap-2 border-t pt-4">
            {open.status !== 'published' ? (
              <StatusForm id={open.id} status="published" label={copy.publish} />
            ) : (
              <StatusForm id={open.id} status="draft" label={copy.unpublish} />
            )}
            {open.status !== 'archived' ? (
              <StatusForm id={open.id} status="archived" label={copy.archive} />
            ) : (
              <StatusForm id={open.id} status="draft" label={copy.restore} />
            )}
            <DeleteProductForm id={open.id} />
          </div>
        </section>
      ) : (
        <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
          <h2 className="font-display text-display-sm">{copy.createTitle}</h2>
          <CreateProductForm vendorOptions={vendorOptions} />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.listTitle}</h2>
        {products.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
        ) : (
          <ul className="flex flex-col gap-2">
            {products.map((product) => (
              <li
                key={product.id}
                className="border-rule bg-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[3px] border px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="border-rule h-12 w-12 rounded-[3px] border object-cover"
                    />
                  ) : (
                    <span className="border-rule text-ink-faint flex h-12 w-12 items-center justify-center rounded-[3px] border text-[10px]">
                      {copy.noImage}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{product.title}</span>
                    <span className="text-ink-faint text-xs">
                      {product.vendor?.name ?? '—'}
                      {' · '}
                      {CATEGORY_LABELS[product.category] ?? product.category}
                      {' · '}
                      {product.price_eur.toFixed(2).replace('.', ',')} €{' · '}
                      {copy.stockLabel.toLowerCase()} {product.stock_qty}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="eyebrow">{statusLabel(product)}</span>
                  <Link
                    href={`${routes.adminShop()}?produit=${product.id}`}
                    className="text-accent text-sm underline"
                  >
                    {copy.edit}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function StatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setProductStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  )
}
