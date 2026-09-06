import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { formatPrice } from '@/lib/shop/model'
import {
  getMyVendor,
  listMyVendorProducts,
  signShopImages,
  type ShopProductRow,
} from '@/lib/shop/queries'
import { currentUser } from '@/lib/supabase/server'

import { actOnMyProduct } from './actions'
import {
  DeleteMyProductForm,
  RetractProductForm,
  StorefrontForm,
  VendorCreateProductForm,
  VendorEditProductForm,
} from './forms'

export const metadata: Metadata = { title: m.vendor.title }

const copy = m.vendor
const CATEGORY_LABELS = m.admin.shop.categories as Record<string, string>
const CONFIRMATIONS = copy.confirmations as Record<string, string>

const STATUS_LABELS: Record<string, string> = {
  draft: copy.statusDraft,
  published: copy.statusPublished,
  archived: copy.statusArchived,
}

function statusLabel(product: ShopProductRow): string {
  if (product.status === 'draft' && product.submitted_at !== null) return copy.statusSubmitted
  return STATUS_LABELS[product.status] ?? product.status
}

/**
 * The vendor space (ADR 0016): a shopfront and its workbench. The /moderation
 * pattern gates it — no vendor attached to the account reads why, never a
 * blank page — and the open panel lives in the URL (`?produit=…`), the /cave
 * rule: every write re-renders this page.
 *
 * Publishing is absent by design: the vendor submits, the house publishes.
 * The screen renders what the WITH CHECK enforces, it never enforces itself.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function VendorSpacePage({ searchParams }: Props) {
  const user = await currentUser()
  if (!user) redirect(`${routes.signIn()}?suite=${encodeURIComponent(routes.vendorSpace())}`)

  const vendor = await getMyVendor(user.id)
  if (!vendor) {
    return (
      <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="font-display text-display-md leading-tight">{copy.restrictedTitle}</h1>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.restrictedBody}</p>
        </div>
      </main>
    )
  }

  const query = await searchParams
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined
  const openId = typeof query.produit === 'string' ? query.produit : null

  const products = await listMyVendorProducts(vendor.id)
  const open = openId ? (products.find((product) => product.id === openId) ?? null) : null
  const images = await signShopImages([
    ...(open ? [open.image_path] : []),
    ...products.map((p) => p.image_path),
  ])
  const suspended = vendor.status === 'suspended'

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">
          {copy.title} — {vendor.name}
        </h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
        {/* The two addresses a vendor keeps asking for: their own shopfront as
            the public reads it, and the shelf their products sit on. */}
        <p className="text-sm">
          {vendor.status === 'active' ? (
            <>
              <Link href={routes.shopVendor(vendor.slug)} className="text-accent underline">
                {copy.publicStorefront}
              </Link>
              {' · '}
            </>
          ) : null}
          <Link href={routes.shop()} className="text-ink underline">
            {copy.viewShop}
          </Link>
        </p>
        {vendor.status === 'pending' ? (
          <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
            {copy.pendingNotice}
          </p>
        ) : null}
        {suspended ? (
          <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
            {copy.suspendedNotice}
          </p>
        ) : null}
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      {open ? (
        <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-display-sm">{copy.editTitle}</h2>
            <Link href={routes.vendorSpace()} className="text-ink-muted text-sm underline">
              {copy.closePanel}
            </Link>
          </div>

          <p className="text-ink-faint text-xs">{statusLabel(open)}</p>
          {open.review_note && open.status === 'draft' ? (
            <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
              {copy.reviewNotePrefix} : {open.review_note}
            </p>
          ) : null}

          {open.image_path && images.get(open.image_path) ? (
            /* signed URL, short-lived and remote: next/image would proxy and
               re-sign nothing. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={images.get(open.image_path)}
              alt={open.title}
              className="border-rule max-h-48 w-fit rounded-[3px] border object-contain"
            />
          ) : (
            <p className="text-ink-faint text-xs">{m.shop.noImage}</p>
          )}

          {suspended ? null : <VendorEditProductForm product={open} />}

          <div className="border-rule flex flex-wrap items-center gap-2 border-t pt-4">
            {!suspended && open.status === 'draft' && open.submitted_at === null ? (
              <GestureForm
                id={open.id}
                gesture="soumettre"
                label={copy.submit}
                hint={copy.submitHint}
              />
            ) : null}
            {!suspended && open.status === 'draft' && open.submitted_at !== null ? (
              <GestureForm id={open.id} gesture="retirer-soumission" label={copy.withdraw} />
            ) : null}
            {!suspended && open.status === 'published' ? <RetractProductForm id={open.id} /> : null}
            {!suspended && open.status === 'draft' ? <DeleteMyProductForm id={open.id} /> : null}
            {!suspended && open.status !== 'draft' && open.status !== 'published' ? (
              <p className="text-ink-faint text-xs">{copy.deleteHint}</p>
            ) : null}
          </div>
        </section>
      ) : suspended ? null : (
        <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-display-sm">{copy.createTitle}</h2>
            <p className="text-ink-muted measure text-sm leading-relaxed">{copy.createLede}</p>
          </div>
          <VendorCreateProductForm />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-display-sm">{copy.productsTitle}</h2>
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
                  {product.image_path && images.get(product.image_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL
                    <img
                      src={images.get(product.image_path)}
                      alt=""
                      className="border-rule h-12 w-12 rounded-[3px] border object-cover"
                    />
                  ) : (
                    <span className="border-rule text-ink-faint flex h-12 w-12 items-center justify-center rounded-[3px] border text-[10px]">
                      {m.shop.noImage}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{product.title}</span>
                    <span className="text-ink-faint text-xs">
                      {CATEGORY_LABELS[product.category] ?? product.category}
                      {' · '}
                      {formatPrice(product.price_eur)}
                      {product.review_note && product.status === 'draft'
                        ? ` · ${copy.reviewNotePrefix.toLowerCase()} : ${product.review_note}`
                        : ''}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="eyebrow">{statusLabel(product)}</span>
                  <Link
                    href={`${routes.vendorSpace()}?produit=${product.id}`}
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

      <section className="border-rule bg-surface flex flex-col gap-4 rounded-[3px] border p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-display-sm">{copy.storefrontTitle}</h2>
          <p className="text-ink-muted measure text-sm leading-relaxed">{copy.storefrontLede}</p>
        </div>
        {suspended ? null : <StorefrontForm vendor={vendor} />}
      </section>
    </main>
  )
}

function GestureForm({
  id,
  gesture,
  label,
  hint,
}: {
  id: string
  gesture: string
  label: string
  hint?: string
}) {
  return (
    <form action={actOnMyProduct} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="gesture" value={gesture} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
      {hint ? <span className="text-ink-faint text-xs">{hint}</span> : null}
    </form>
  )
}
