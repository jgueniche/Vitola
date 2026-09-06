import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { isFeatureEnabled } from '@/lib/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { DEMO_ORDER_COOKIE, parseDemoOrder } from '@/lib/shop/cart'
import { formatPrice } from '@/lib/shop/model'

export const metadata: Metadata = { title: m.shop.confirmation.title }

const copy = m.shop.confirmation

/**
 * The end of the demo funnel. The order lives in a short-lived cookie the
 * payment action wrote — refreshing the page rereads it, and once it expires
 * there is nothing to show, so the address degrades to the shop rather than
 * to an empty recap pretending to be an order.
 */
export default async function ShopConfirmationPage() {
  if (!(await isFeatureEnabled('shop_enabled'))) notFound()

  const store = await cookies()
  const order = parseDemoOrder(store.get(DEMO_ORDER_COOKIE)?.value)
  if (order === null) redirect(routes.shop())

  return (
    <main id="contenu" className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="font-display text-display-md leading-tight">{copy.title}</h1>
      </div>

      <p
        role="status"
        className="border-accent text-ink measure rounded-[3px] border px-4 py-3 text-sm leading-relaxed"
      >
        {copy.status}
      </p>

      <p className="text-sm">
        <span className="eyebrow mr-2">{copy.reference}</span>
        <span className="font-mono">{order.reference}</span>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-display-sm">{copy.linesTitle}</h2>
        <ul className="border-rule bg-surface flex flex-col gap-1.5 rounded-[3px] border p-4 text-sm">
          {order.lines.map((line) => (
            <li key={line.slug} className="flex justify-between gap-3">
              <Link
                href={routes.shopProduct(line.slug)}
                className="text-ink-muted min-w-0 underline-offset-2 hover:underline"
              >
                {line.qty} × {line.title}
              </Link>
              <span className="font-mono">{formatPrice(line.priceEur * line.qty)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-display-sm">{copy.totalsTitle}</h2>
        <dl className="border-rule bg-surface flex flex-col gap-1.5 rounded-[3px] border p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">{m.shop.cart.itemsTotal}</dt>
            <dd className="font-mono">{formatPrice(order.totals.itemsEur)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">{m.shop.cart.shipping}</dt>
            <dd className="font-mono">
              {order.totals.shippingEur === 0
                ? m.shop.cart.shippingFree
                : formatPrice(order.totals.shippingEur)}
            </dd>
          </div>
          <div className="border-rule flex justify-between border-t pt-1.5 font-semibold">
            <dt>{m.shop.cart.total}</dt>
            <dd className="font-mono">{formatPrice(order.totals.totalEur)}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-display-sm">{copy.shippingTitle}</h2>
        <div className="border-rule bg-surface flex flex-col gap-0.5 rounded-[3px] border p-4 text-sm">
          <p>{order.shipping.fullName}</p>
          <p className="text-ink-muted">{order.shipping.address}</p>
          <p className="text-ink-muted">
            {order.shipping.postalCode} {order.shipping.city}
          </p>
          <p className="text-ink-muted">{order.shipping.email}</p>
        </div>
      </section>

      <p className="text-sm">
        <Link href={routes.shop()} className="text-accent underline">
          {copy.backToShop}
        </Link>
      </p>
    </main>
  )
}
