import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { MAX_LINE_QTY } from '@/lib/shop/cart'
import { formatPrice } from '@/lib/shop/model'
import { getShopProductBySlug, signShopImages } from '@/lib/shop/queries'

import { addToCartAction } from '../actions'

const copy = m.shop
const CATEGORY_LABELS = m.admin.shop.categories as Record<string, string>

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getShopProductBySlug(slug)
  return { title: product ? product.title : copy.title }
}

/**
 * One product sheet (ADR 0016). The buy button arrived with the demo funnel
 * (owner's decision, 25 août 2026): a plain form posting to a Server Action,
 * zero client JavaScript, landing on the cart with its confirmation in the
 * URL. It only renders while there is stock — a button toward a refusal is a
 * promise the shelf cannot keep. The vendor and the brand are both links —
 * the two entries of the marketplace, on every sheet.
 */
export default async function ShopProductPage({ params }: Props) {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const { slug } = await params
  const product = await getShopProductBySlug(slug)
  if (!product) notFound()

  const images = await signShopImages([product.image_path])
  const imageUrl = product.image_path ? images.get(product.image_path) : undefined

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <p className="text-sm">
        <Link href={routes.shop()} className="text-ink-muted underline">
          {copy.backToShop}
        </Link>
      </p>

      <div className="flex flex-col gap-8 md:flex-row">
        <div className="w-full md:w-80 md:shrink-0">
          {imageUrl ? (
            /* signed URL, short-lived and remote: next/image would proxy and
               re-sign nothing. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={product.title}
              className="border-rule w-full rounded-[3px] border object-contain"
            />
          ) : (
            <span className="border-rule text-ink-faint flex h-64 w-full items-center justify-center rounded-[3px] border text-xs">
              {copy.noImage}
            </span>
          )}
        </div>

        <div className="flex grow flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">{CATEGORY_LABELS[product.category] ?? product.category}</p>
            <h1 className="font-display text-4xl leading-tight">{product.title}</h1>
            <p className="text-ink-muted text-sm">
              {product.brand ? (
                <>
                  {copy.madeBy}{' '}
                  <Link
                    href={`${routes.shop()}?marque=${encodeURIComponent(product.brand)}`}
                    className="text-ink underline"
                  >
                    {product.brand}
                  </Link>
                  {' · '}
                </>
              ) : null}
              {copy.soldBy}{' '}
              {product.vendor ? (
                <Link href={routes.shopVendor(product.vendor.slug)} className="text-ink underline">
                  {product.vendor.name}
                </Link>
              ) : (
                '—'
              )}
            </p>
          </div>

          <p className="font-mono text-2xl">{formatPrice(product.price_eur)}</p>
          <p className="text-ink-muted text-sm">
            {product.stock_qty > 0 ? copy.inStock : copy.outOfStock}
          </p>

          {product.stock_qty > 0 ? (
            <form action={addToCartAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="productId" value={product.id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="qty" className="eyebrow">
                  {copy.qtyLabel}
                </label>
                <input
                  id="qty"
                  name="qty"
                  type="number"
                  min={1}
                  max={MAX_LINE_QTY}
                  defaultValue={1}
                  className="border-rule-strong bg-surface text-ink h-10 w-20 rounded-[3px] border px-3 text-sm tabular-nums"
                />
              </div>
              <Button type="submit">{copy.addToCart}</Button>
            </form>
          ) : null}
          <p className="text-ink-faint measure text-xs leading-relaxed">{copy.demoPriceNote}</p>

          {product.description ? (
            <div className="measure flex flex-col gap-2 text-sm leading-relaxed">
              {product.description.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">{copy.reviewsTitle}</h2>
        {/* ADR 0015 D3, unchanged by 0016: nothing can write a review until
            the checkout decides « achat vérifié » — the empty state says so
            rather than hiding the section. */}
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.reviewsEmpty}</p>
      </section>
    </main>
  )
}
