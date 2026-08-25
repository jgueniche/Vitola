import { cookies } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { CART_COOKIE, cartCount, parseCart } from '@/lib/shop/cart'

const copy = m.shop

/**
 * The shop's own chrome, on every page under /boutique: the demo banner —
 * the funnel goes to a payment screen, so no page may leave a doubt about
 * what that payment is — and the section nav with the live cart count. It is
 * a layout rather than a component each page remembers to render, for the
 * same reason the middleware matcher is a negation: forgetting fails closed.
 *
 * Reading the cart cookie here is free: every page under this layout already
 * renders dynamically (they all read the database).
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const store = await cookies()
  const count = cartCount(parseCart(store.get(CART_COOKIE)?.value))

  return (
    <>
      <p className="border-accent bg-surface text-ink border-b px-4 py-2 text-center text-xs">
        <span className="border-accent text-accent mr-2 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {copy.demo.badge}
        </span>
        {copy.demo.banner}
      </p>
      <nav aria-label={copy.nav.label} className="border-rule border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-sm">
          <Link href={routes.shop()} className="text-ink font-semibold">
            {copy.eyebrow}
          </Link>
          <Link href={routes.shop()} className="text-ink-muted hover:text-ink">
            {copy.nav.all}
          </Link>
          <Link
            href={routes.shopCart()}
            className="text-ink-muted hover:text-ink ml-auto inline-flex items-center gap-1.5"
          >
            {copy.nav.cart}
            <span
              className={`rounded-[3px] border px-1.5 text-xs tabular-nums ${count > 0 ? 'border-accent text-accent' : 'border-rule text-ink-faint'}`}
            >
              {count}
            </span>
          </Link>
        </div>
      </nav>
      {children}
    </>
  )
}
