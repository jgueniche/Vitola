import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/layout/empty-state'
import { Button } from '@/components/ui/button'
import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  CART_COOKIE,
  cartTotals,
  MAX_LINE_QTY,
  parseCart,
  SHIPPING_FREE_FROM_EUR,
} from '@/lib/shop/cart'
import { formatPrice } from '@/lib/shop/model'
import { getShopProductsByIds, signShopImages } from '@/lib/shop/queries'

import { clearCartAction, removeCartLineAction, updateCartLineAction } from '../actions'

export const metadata: Metadata = { title: m.shop.cart.title }

const copy = m.shop.cart
const CONFIRMATIONS = copy.confirmations as Record<string, string>

/**
 * The cart, first screen of the demo funnel. Zero client JavaScript: each
 * line is two plain forms (a quantity update, a removal) posting to Server
 * Actions that navigate back here with `?fait=…` — the /cave rule, since
 * every write re-renders the page.
 *
 * The cookie may name products no longer on sale (retracted, vendor
 * suspended): the resolved read drops them and the page says so, rather than
 * silently selling a ghost or crashing on it.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ShopCartPage({ searchParams }: Props) {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const [query, store] = await Promise.all([searchParams, cookies()])
  const done = typeof query.fait === 'string' ? CONFIRMATIONS[query.fait] : undefined

  const cart = parseCart(store.get(CART_COOKIE)?.value)
  const products = await getShopProductsByIds(cart.map((line) => line.productId))
  const byId = new Map(products.map((product) => [product.id, product]))
  const lines = cart.flatMap((line) => {
    const product = byId.get(line.productId)
    return product ? [{ ...line, product }] : []
  })
  const missing = cart.length - lines.length
  const images = await signShopImages(lines.map((line) => line.product.image_path))
  const totals = cartTotals(
    lines.map((line) => ({ priceEur: line.product.price_eur, qty: line.qty })),
  )

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
        <p className="text-ink-muted measure text-sm leading-relaxed">{copy.lede}</p>
      </div>

      {done ? (
        <p role="status" className="border-rule text-ink rounded-[3px] border px-4 py-3 text-sm">
          {done}
        </p>
      ) : null}

      {missing > 0 ? (
        <p className="border-rule text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
          {copy.unavailable}
        </p>
      ) : null}

      {lines.length === 0 ? (
        <>
          <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
          <p className="text-sm">
            <Link href={routes.shop()} className="text-accent underline">
              {copy.browse}
            </Link>
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row">
          <ul className="flex grow flex-col gap-2">
            {lines.map(({ product, qty }) => (
              <li
                key={product.id}
                className="border-rule bg-surface flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[3px] border px-4 py-3"
              >
                {product.image_path && images.get(product.image_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img
                    src={images.get(product.image_path)}
                    alt=""
                    className="border-rule h-14 w-14 rounded-[3px] border object-cover"
                  />
                ) : (
                  <span className="border-rule text-ink-faint flex h-14 w-14 items-center justify-center rounded-[3px] border text-[10px]">
                    {m.shop.noImage}
                  </span>
                )}
                <span className="flex min-w-0 grow flex-col">
                  <Link
                    href={routes.shopProduct(product.slug)}
                    className="text-ink font-semibold underline-offset-2 hover:underline"
                  >
                    {product.title}
                  </Link>
                  <span className="text-ink-faint text-xs">
                    {copy.unitPrice} : {formatPrice(product.price_eur)}
                  </span>
                </span>
                <form action={updateCartLineAction} className="flex items-center gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <label htmlFor={`qty-${product.id}`} className="eyebrow">
                    {copy.qty}
                  </label>
                  <input
                    id={`qty-${product.id}`}
                    name="qty"
                    type="number"
                    min={0}
                    max={MAX_LINE_QTY}
                    defaultValue={qty}
                    className="border-rule-strong bg-surface text-ink h-8 w-16 rounded-[3px] border px-2 text-sm tabular-nums"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.update}
                  </Button>
                </form>
                <form action={removeCartLineAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {copy.remove}
                  </Button>
                </form>
                <span className="font-mono text-sm">{formatPrice(product.price_eur * qty)}</span>
              </li>
            ))}
          </ul>

          <aside className="border-rule bg-surface flex h-fit w-full flex-col gap-3 rounded-[3px] border p-4 lg:w-72 lg:shrink-0">
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">{copy.itemsTotal}</dt>
                <dd className="font-mono">{formatPrice(totals.itemsEur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{copy.shipping}</dt>
                <dd className="font-mono">
                  {totals.shippingEur === 0 ? copy.shippingFree : formatPrice(totals.shippingEur)}
                </dd>
              </div>
              <div className="border-rule flex justify-between border-t pt-1.5 font-semibold">
                <dt>{copy.total}</dt>
                <dd className="font-mono">{formatPrice(totals.totalEur)}</dd>
              </div>
            </dl>
            <p className="text-ink-faint text-xs">
              {copy.shippingFreeFrom.replace('{n}', formatPrice(SHIPPING_FREE_FROM_EUR))}
            </p>
            <Link
              href={routes.shopCheckout()}
              className="bg-accent text-on-accent hover:bg-accent-bright inline-flex h-10 items-center justify-center rounded-[3px] px-4 text-sm font-medium transition-colors duration-(--duration-quick)"
            >
              {copy.checkout}
            </Link>
            <form action={clearCartAction} className="text-center">
              <Button type="submit" variant="ghost" size="sm">
                {copy.clear}
              </Button>
            </form>
            <p className="text-ink-faint text-xs">{m.shop.demoPriceNote}</p>
          </aside>
        </div>
      )}
    </main>
  )
}
