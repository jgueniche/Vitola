'use server'

import { randomInt } from 'node:crypto'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  addLine,
  CART_COOKIE,
  cartTotals,
  DEMO_ORDER_COOKIE,
  demoCardSchema,
  demoOrderReference,
  parseCart,
  parseShipping,
  removeLine,
  serializeCart,
  setLineQty,
  SHIPPING_COOKIE,
  shippingSchema,
  type DemoOrder,
} from '@/lib/shop/cart'
import { getShopProductsByIds } from '@/lib/shop/queries'

/**
 * The demo checkout's writes. Everything is a cookie (see lib/shop/cart.ts
 * for why there is no order table yet), so every action here follows the
 * same shape: read the cookie, apply a pure function from the cart model,
 * write the cookie back, navigate. The confirmation travels in the URL
 * (`?fait=…`), the /cave rule: every write re-renders the page it lands on.
 *
 * Zod on every action (§8). The cookies are not trusted either — parseCart
 * and parseShipping treat them as attacker-typed input.
 */

const CART_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 14,
} as const

const lineActionSchema = z.object({
  productId: z.uuid(),
  qty: z.preprocess(
    (value) => Number.parseInt(String(value ?? '1') || '1', 10),
    z.number().int().min(0).max(999),
  ),
})

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = lineActionSchema.safeParse({
    productId: formData.get('productId'),
    qty: formData.get('qty') ?? '1',
  })
  if (!parsed.success) redirect(routes.shopCart())

  /* Only what is on sale enters the cart: the same published+active read the
     shelf uses, so a retracted product cannot be added by replaying a form. */
  const onSale = await getShopProductsByIds([parsed.data.productId])
  if (onSale.length === 0) redirect(routes.shopCart())

  const store = await cookies()
  const cart = addLine(
    parseCart(store.get(CART_COOKIE)?.value),
    parsed.data.productId,
    Math.max(parsed.data.qty, 1),
  )
  store.set(CART_COOKIE, serializeCart(cart), CART_COOKIE_OPTS)
  redirect(`${routes.shopCart()}?fait=ajout`)
}

export async function updateCartLineAction(formData: FormData): Promise<void> {
  const parsed = lineActionSchema.safeParse({
    productId: formData.get('productId'),
    qty: formData.get('qty'),
  })
  if (!parsed.success) redirect(routes.shopCart())

  const store = await cookies()
  const cart = setLineQty(
    parseCart(store.get(CART_COOKIE)?.value),
    parsed.data.productId,
    parsed.data.qty,
  )
  store.set(CART_COOKIE, serializeCart(cart), CART_COOKIE_OPTS)
  redirect(`${routes.shopCart()}?fait=${parsed.data.qty === 0 ? 'retrait' : 'maj'}`)
}

export async function removeCartLineAction(formData: FormData): Promise<void> {
  const parsed = z.object({ productId: z.uuid() }).safeParse({
    productId: formData.get('productId'),
  })
  if (!parsed.success) redirect(routes.shopCart())

  const store = await cookies()
  const cart = removeLine(parseCart(store.get(CART_COOKIE)?.value), parsed.data.productId)
  store.set(CART_COOKIE, serializeCart(cart), CART_COOKIE_OPTS)
  redirect(`${routes.shopCart()}?fait=retrait`)
}

export async function clearCartAction(): Promise<void> {
  const store = await cookies()
  store.delete(CART_COOKIE)
  redirect(`${routes.shopCart()}?fait=vide`)
}

/* ------------------------------------------------------------------------- */

export type CheckoutState = {
  errors?: Partial<Record<string, string>>
  /* What was typed, echoed back on a refusal: React 19 resets the form when
     the action returns, and without this echo the refusal would also be a
     wipe — the ScopeSelector lesson, applied to text fields. */
  values?: Partial<Record<string, string>>
}

/**
 * The address step. On refusal the form re-reads its errors in place
 * (useActionState); on success the address rides its own cookie to the
 * payment step — a demo order has nowhere else to exist (the tasting-draft
 * precedent, server-side).
 */
export async function submitCheckoutAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const raw = {
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    city: String(formData.get('city') ?? ''),
  }
  const parsed = shippingSchema.safeParse(raw)
  if (!parsed.success) {
    const errors: Partial<Record<string, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
    }
    return { errors, values: raw }
  }

  const store = await cookies()
  if (parseCart(store.get(CART_COOKIE)?.value).length === 0) {
    return { errors: { cart: m.shop.checkout.errors.cartEmpty }, values: raw }
  }

  store.set(SHIPPING_COOKIE, JSON.stringify(parsed.data), CART_COOKIE_OPTS)
  redirect(routes.shopCheckoutPayment())
}

/* ------------------------------------------------------------------------- */

export type PaymentState = {
  errors?: Partial<Record<string, string>>
  /* Same echo as CheckoutState: a refused card must not also be a wiped one. */
  values?: Partial<Record<string, string>>
}

/**
 * The demo payment. The card is validated for SHAPE only — QA needs refusal
 * states — and the card fields are never stored anywhere: what survives is
 * the order snapshot (titles, prices, quantities, address), in a cookie the
 * confirmation page reads once. The cart and address cookies are cleared in
 * the same action: paying empties the basket, even a fictitious paying.
 */
export async function confirmDemoPaymentAction(
  _previous: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const raw = {
    cardNumber: String(formData.get('cardNumber') ?? ''),
    expiry: String(formData.get('expiry') ?? ''),
    cvc: String(formData.get('cvc') ?? ''),
  }
  const parsed = demoCardSchema.safeParse(raw)
  if (!parsed.success) {
    const errors: Partial<Record<string, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
    }
    return { errors, values: raw }
  }

  const store = await cookies()
  const cart = parseCart(store.get(CART_COOKIE)?.value)
  const shipping = parseShipping(store.get(SHIPPING_COOKIE)?.value)
  if (cart.length === 0 || shipping === null) {
    return { errors: { cart: m.shop.payment.errors.cartGone }, values: raw }
  }

  /* Snapshot against the shelf as it is NOW: a product retracted between the
     cart and the payment drops out of the order rather than being sold. */
  const products = await getShopProductsByIds(cart.map((line) => line.productId))
  const byId = new Map(products.map((product) => [product.id, product]))
  const lines = cart.flatMap((line) => {
    const product = byId.get(line.productId)
    return product
      ? [{ title: product.title, slug: product.slug, qty: line.qty, priceEur: product.price_eur }]
      : []
  })
  if (lines.length === 0) {
    return { errors: { cart: m.shop.payment.errors.cartGone } }
  }

  const order: DemoOrder = {
    reference: demoOrderReference((max) => randomInt(max)),
    placedAt: new Date().toISOString(),
    lines,
    totals: cartTotals(lines),
    shipping,
  }

  store.set(DEMO_ORDER_COOKIE, JSON.stringify(order), { ...CART_COOKIE_OPTS, maxAge: 60 * 60 })
  store.delete(CART_COOKIE)
  store.delete(SHIPPING_COOKIE)
  redirect(routes.shopCheckoutDone())
}
