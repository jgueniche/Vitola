import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { listProducts } from '@/lib/admin/queries'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'

import { setProductStatus } from '../actions'
import { AdminRestricted, adminView } from '../shell'
import { CreateProductForm, DeleteProductForm, EditProductForm } from './product-forms'

export const metadata: Metadata = { title: m.admin.shop.title }

const copy = m.admin.shop

const CONFIRMATIONS: Record<string, string> = {
  'produit-publie': m.admin.confirmations.produitPublie,
  'produit-depublie': m.admin.confirmations.produitDepublie,
  'produit-archive': m.admin.confirmations.produitArchive,
  'produit-supprime': m.admin.confirmations.produitSupprime,
  refus: m.admin.confirmations.refus,
}

const STATUS_LABELS: Record<string, string> = {
  draft: copy.statusDraft,
  published: copy.statusPublished,
  archived: copy.statusArchived,
}

const CATEGORY_LABELS = copy.categories as Record<string, string>

/**
 * The catalogue, fed without a developer (ADR 0015).
 *
 * The open edit panel lives in the URL (`?produit=…`), because every write on
 * this page re-renders it and a panel held in a client component would close
 * under the admin's hands — the /cave rule. Status changes and deletion
 * navigate with the outcome (`?fait=…`), keeping the panel open through its
 * own re-render; the two forms return state, because their row survives.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminShopPage({ searchParams }: Props) {
  const isAdmin = await adminView(routes.adminShop())
  if (!isAdmin) return <AdminRestricted />

  const query = await searchParams
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined
  const openId = typeof query.produit === 'string' ? query.produit : null

  const products = await listProducts()
  const open = openId ? (products.find((product) => product.id === openId) ?? null) : null

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
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

      {open ? (
        <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl">{copy.editTitle}</h2>
            <Link href={routes.adminShop()} className="text-ink-muted text-sm underline">
              {copy.closePanel}
            </Link>
          </div>

          {open.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL,
            // short-lived and remote: next/image would proxy and re-sign nothing.
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
          <h2 className="font-display text-2xl">{copy.createTitle}</h2>
          <CreateProductForm />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">{copy.listTitle}</h2>
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
                      {CATEGORY_LABELS[product.category] ?? product.category}
                      {' · '}
                      {product.price_eur.toFixed(2).replace('.', ',')} €{' · '}
                      {copy.stockLabel.toLowerCase()} {product.stock_qty}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="eyebrow">{STATUS_LABELS[product.status] ?? product.status}</span>
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
