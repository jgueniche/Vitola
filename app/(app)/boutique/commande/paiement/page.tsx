import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { CART_COOKIE, cartTotals, parseCart, parseShipping, SHIPPING_COOKIE } from '@/lib/shop/cart'
import { formatPrice } from '@/lib/shop/model'
import { getShopProductsByIds } from '@/lib/shop/queries'

import { PaymentForm } from './payment-form'

export const metadata: Metadata = { title: m.shop.payment.title }

const copy = m.shop.payment

/**
 * The payment step — the last screen of the demo funnel, and the one whose
 * honesty matters most: its lede says, before any field, that no payment
 * provider is wired, nothing is charged and nothing is stored. A missing
 * cart or address sends the visitor back to the step that owns the gap.
 */
export default async function ShopPaymentPage() {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const store = await cookies()
  const cart = parseCart(store.get(CART_COOKIE)?.value)
  if (cart.length === 0) redirect(routes.shopCart())
  const shipping = parseShipping(store.get(SHIPPING_COOKIE)?.value)
  if (shipping === null) redirect(routes.shopCheckout())

  const products = await getShopProductsByIds(cart.map((line) => line.productId))
  const byId = new Map(products.map((product) => [product.id, product]))
  const lines = cart.flatMap((line) => {
    const product = byId.get(line.productId)
    return product ? [{ product, qty: line.qty }] : []
  })
  if (lines.length === 0) redirect(routes.shopCart())

  const totals = cartTotals(lines.map((line) => ({ priceEur: line.product.price_eur, qty: line.qty })))

  return (
    <main id="contenu" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-4xl leading-tight">{copy.title}</h1>
        <p className="border-accent text-ink measure border-l-2 pl-3 text-sm leading-relaxed">
          {copy.lede}
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <section className="grow">
          <PaymentForm totalLabel={formatPrice(totals.totalEur)} />
          <p className="mt-4 text-sm">
            <Link href={routes.shopCheckout()} className="text-ink-muted underline">
              {copy.backToCheckout}
            </Link>
          </p>
        </section>

        <aside className="border-rule bg-surface flex h-fit w-full flex-col gap-3 rounded-[3px] border p-4 lg:w-80 lg:shrink-0">
          <h2 className="eyebrow">{m.shop.checkout.recapTitle}</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {lines.map(({ product, qty }) => (
              <li key={product.id} className="flex justify-between gap-3">
                <span className="text-ink-muted min-w-0">
                  {qty} × {product.title}
                </span>
                <span className="font-mono">{formatPrice(product.price_eur * qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="border-rule flex flex-col gap-1.5 border-t pt-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{m.shop.cart.shipping}</dt>
              <dd className="font-mono">
                {totals.shippingEur === 0 ? m.shop.cart.shippingFree : formatPrice(totals.shippingEur)}
              </dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{m.shop.cart.total}</dt>
              <dd className="font-mono">{formatPrice(totals.totalEur)}</dd>
            </div>
          </dl>
          <div className="border-rule flex flex-col gap-0.5 border-t pt-2 text-sm">
            <p className="eyebrow">{m.shop.confirmation.shippingTitle}</p>
            <p className="text-ink-muted">{shipping.fullName}</p>
            <p className="text-ink-muted">{shipping.address}</p>
            <p className="text-ink-muted">
              {shipping.postalCode} {shipping.city}
            </p>
          </div>
        </aside>
      </div>
    </main>
  )
}
