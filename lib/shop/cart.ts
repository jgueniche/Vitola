import { z } from 'zod'

import { m } from '@/lib/i18n'

/**
 * The demo checkout of the shop (owner's decision, 25 août 2026).
 *
 * There is no Stripe key and no `shop.orders` table: the whole funnel exists
 * so QA can walk the shop end to end — shelf, sheet, cart, address, payment,
 * confirmation — before any money is real. Three consequences shape this
 * file:
 *
 *   - **The cart is a cookie, not a table.** A visitor has no account to hang
 *     rows on (the shop is in front of the age gate), and a demo order that
 *     nobody will ship has no business becoming a durable row. The day a real
 *     checkout lands (Stripe, ADR 0016 D7), the order table arrives with it,
 *     RLS first — and this cookie becomes its staging area, nothing more.
 *   - **Everything here is pure**, because the lib/ rule says so: parsing is
 *     tolerant (a tampered cookie degrades to an empty cart, never a crash),
 *     bounds are explicit, and the unit tests read like the contract.
 *   - **The payment is fictitious and says so.** The card form validates
 *     shape — QA needs refusal states — but accepts any well-formed number.
 *     Nothing is charged, nothing ships, and every screen of the funnel
 *     carries the demo banner.
 */

export const CART_COOKIE = 'vitola_panier'
export const SHIPPING_COOKIE = 'vitola_livraison'
export const DEMO_ORDER_COOKIE = 'vitola_commande_demo'

/** A cart, not a warehouse: past these bounds the cookie is somebody playing. */
export const MAX_CART_LINES = 20
export const MAX_LINE_QTY = 20

/** Demo shipping maths — fictitious, flat, and labelled as such on screen. */
export const SHIPPING_FLAT_EUR = 6.9
export const SHIPPING_FREE_FROM_EUR = 80

export type CartLine = { productId: string; qty: number }

const lineSchema = z.object({
  productId: z.uuid(),
  qty: z.number().int().min(1).max(MAX_LINE_QTY),
})

/**
 * A cookie is attacker-typed input, so parsing never throws: bad JSON, a
 * non-array, a malformed line, a duplicated product — each degrades to «this
 * entry does not exist», and the worst a forged cookie achieves is an empty
 * cart. Quantities above the bound clamp rather than vanish: the person who
 * typed 400 meant «a lot», not «nothing».
 */
export function parseCart(raw: string | undefined | null): CartLine[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  const lines: CartLine[] = []
  const seen = new Set<string>()
  for (const entry of data) {
    const clamped =
      typeof entry === 'object' && entry !== null && 'qty' in entry
        ? { ...entry, qty: clampQty((entry as { qty: unknown }).qty) }
        : entry
    const parsed = lineSchema.safeParse(clamped)
    if (!parsed.success) continue
    if (seen.has(parsed.data.productId)) continue
    seen.add(parsed.data.productId)
    lines.push(parsed.data)
    if (lines.length >= MAX_CART_LINES) break
  }
  return lines
}

function clampQty(value: unknown): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.NaN
  if (!Number.isFinite(n)) return Number.NaN
  return Math.min(Math.max(n, 1), MAX_LINE_QTY)
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify(lines)
}

/** Adding an already-present product grows its line, still under the cap. */
export function addLine(lines: CartLine[], productId: string, qty: number): CartLine[] {
  const wanted = clampQty(qty)
  if (Number.isNaN(wanted)) return lines
  const existing = lines.find((line) => line.productId === productId)
  if (existing) {
    return lines.map((line) =>
      line.productId === productId
        ? { ...line, qty: Math.min(line.qty + wanted, MAX_LINE_QTY) }
        : line,
    )
  }
  if (lines.length >= MAX_CART_LINES) return lines
  return [...lines, { productId, qty: wanted }]
}

/** Zero removes the line: «none of it» and «not in my cart» are one state. */
export function setLineQty(lines: CartLine[], productId: string, qty: number): CartLine[] {
  if (qty <= 0) return removeLine(lines, productId)
  const wanted = clampQty(qty)
  if (Number.isNaN(wanted)) return lines
  return lines.map((line) => (line.productId === productId ? { ...line, qty: wanted } : line))
}

export function removeLine(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId)
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

export type CartTotals = { itemsEur: number; shippingEur: number; totalEur: number }

/**
 * Money in cents internally: 3 × 24,90 summed as floats is 74.699…99, and a
 * total that ends in …99 for no reason is the kind of bug QA is here to catch,
 * not to ship.
 */
export function cartTotals(items: ReadonlyArray<{ priceEur: number; qty: number }>): CartTotals {
  const itemsCents = items.reduce((sum, item) => sum + Math.round(item.priceEur * 100) * item.qty, 0)
  const shippingCents =
    itemsCents === 0 || itemsCents >= SHIPPING_FREE_FROM_EUR * 100
      ? 0
      : Math.round(SHIPPING_FLAT_EUR * 100)
  return {
    itemsEur: itemsCents / 100,
    shippingEur: shippingCents / 100,
    totalEur: (itemsCents + shippingCents) / 100,
  }
}

/* ------------------------------------------------------------------------- */

/** The delivery address of the demo order. France only: nothing really ships. */
export const shippingSchema = z.object({
  fullName: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, m.shop.checkout.errors.name).max(80, m.shop.checkout.errors.name)),
  email: z.email(m.shop.checkout.errors.email).max(254),
  address: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(5, m.shop.checkout.errors.address).max(200, m.shop.checkout.errors.address)),
  postalCode: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().regex(/^\d{5}$/, m.shop.checkout.errors.postalCode)),
  city: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, m.shop.checkout.errors.city).max(80, m.shop.checkout.errors.city)),
})

export type ShippingInput = z.infer<typeof shippingSchema>

export function parseShipping(raw: string | undefined | null): ShippingInput | null {
  if (!raw) return null
  try {
    const parsed = shippingSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The demo card form. It validates SHAPE so QA can exercise refusals, and
 * nothing else: any well-formed number «pays». No Luhn, no network, no PSP —
 * a real check would be a lie about what this step is.
 */
export const demoCardSchema = z.object({
  cardNumber: z
    .string()
    .transform((value) => value.replaceAll(' ', ''))
    .pipe(z.string().regex(/^\d{16}$/, m.shop.payment.errors.cardNumber)),
  expiry: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, m.shop.payment.errors.expiry)),
  cvc: z.string().regex(/^\d{3}$/, m.shop.payment.errors.cvc),
})

/** The number every payment sandbox has taught people to type. */
export const DEMO_CARD_NUMBER = '4242 4242 4242 4242'

/* ------------------------------------------------------------------------- */

export type DemoOrderLine = { title: string; slug: string; qty: number; priceEur: number }

export type DemoOrder = {
  reference: string
  placedAt: string
  lines: DemoOrderLine[]
  totals: CartTotals
  shipping: ShippingInput
}

const demoOrderSchema: z.ZodType<DemoOrder> = z.object({
  reference: z.string().regex(/^QA-[A-Z0-9]{6}$/),
  placedAt: z.iso.datetime(),
  lines: z
    .array(
      z.object({
        title: z.string().min(1),
        slug: z.string().min(1),
        qty: z.number().int().min(1).max(MAX_LINE_QTY),
        priceEur: z.number().min(0),
      }),
    )
    .min(1)
    .max(MAX_CART_LINES),
  totals: z.object({
    itemsEur: z.number().min(0),
    shippingEur: z.number().min(0),
    totalEur: z.number().min(0),
  }),
  shipping: shippingSchema,
})

/** `QA-` on purpose: a reference that cannot be mistaken for a real order's. */
export function demoOrderReference(randomInt: (max: number) => number): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)]
  return `QA-${suffix}`
}

export function parseDemoOrder(raw: string | undefined | null): DemoOrder | null {
  if (!raw) return null
  try {
    const parsed = demoOrderSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
