import { describe, expect, it } from 'vitest'

import {
  addLine,
  cartCount,
  cartTotals,
  demoOrderReference,
  MAX_CART_LINES,
  MAX_LINE_QTY,
  parseCart,
  parseDemoOrder,
  parseShipping,
  removeLine,
  serializeCart,
  setLineQty,
  SHIPPING_FLAT_EUR,
  SHIPPING_FREE_FROM_EUR,
  shippingSchema,
  demoCardSchema,
} from '@/lib/shop/cart'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

/**
 * The demo cart is a cookie, and a cookie is attacker-typed input: half of
 * this file is the tolerance contract (garbage degrades to an empty cart,
 * never a crash), the other half is the arithmetic the funnel screens print.
 */

describe('parseCart — a cookie is attacker-typed input', () => {
  it('round-trips what serializeCart wrote', () => {
    const lines = [
      { productId: ID_A, qty: 2 },
      { productId: ID_B, qty: 1 },
    ]
    expect(parseCart(serializeCart(lines))).toEqual(lines)
  })

  it.each([
    ['nothing', undefined],
    ['empty string', ''],
    ['broken JSON', '{nope'],
    ['a non-array', '{"productId":"x"}'],
    ['an array of garbage', '[1,"two",null]'],
  ])('degrades %s to an empty cart', (_label, raw) => {
    expect(parseCart(raw as string | undefined)).toEqual([])
  })

  it('drops a malformed line and keeps the valid ones', () => {
    const raw = JSON.stringify([
      { productId: 'not-a-uuid', qty: 2 },
      { productId: ID_A, qty: 3 },
    ])
    expect(parseCart(raw)).toEqual([{ productId: ID_A, qty: 3 }])
  })

  it('clamps an absurd quantity instead of dropping the line — 400 meant «a lot»', () => {
    const raw = JSON.stringify([{ productId: ID_A, qty: 400 }])
    expect(parseCart(raw)).toEqual([{ productId: ID_A, qty: MAX_LINE_QTY }])
  })

  it('keeps the first of two lines naming the same product', () => {
    const raw = JSON.stringify([
      { productId: ID_A, qty: 1 },
      { productId: ID_A, qty: 5 },
    ])
    expect(parseCart(raw)).toEqual([{ productId: ID_A, qty: 1 }])
  })

  it('caps the number of lines', () => {
    const many = Array.from({ length: MAX_CART_LINES + 5 }, (_, i) => ({
      productId: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      qty: 1,
    }))
    expect(parseCart(JSON.stringify(many))).toHaveLength(MAX_CART_LINES)
  })
})

describe('cart gestures', () => {
  it('adds a new line, and grows an existing one under the cap', () => {
    let cart = addLine([], ID_A, 2)
    expect(cart).toEqual([{ productId: ID_A, qty: 2 }])
    cart = addLine(cart, ID_A, MAX_LINE_QTY)
    expect(cart).toEqual([{ productId: ID_A, qty: MAX_LINE_QTY }])
  })

  it('refuses a new line past the line cap, silently keeping the cart', () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) => ({
      productId: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      qty: 1,
    }))
    expect(addLine(full, ID_A, 1)).toHaveLength(MAX_CART_LINES)
  })

  it('treats qty 0 as removal — «none of it» and «not in my cart» are one state', () => {
    const cart = [{ productId: ID_A, qty: 2 }]
    expect(setLineQty(cart, ID_A, 0)).toEqual([])
  })

  it('removes only the named line', () => {
    const cart = [
      { productId: ID_A, qty: 2 },
      { productId: ID_B, qty: 1 },
    ]
    expect(removeLine(cart, ID_A)).toEqual([{ productId: ID_B, qty: 1 }])
  })

  it('counts items, not lines', () => {
    expect(
      cartCount([
        { productId: ID_A, qty: 2 },
        { productId: ID_B, qty: 3 },
      ]),
    ).toBe(5)
  })
})

describe('cartTotals — money in cents, never floats', () => {
  it('sums 3 × 24,90 to exactly 74,70, not 74,699…', () => {
    const totals = cartTotals([{ priceEur: 24.9, qty: 3 }])
    expect(totals.itemsEur).toBe(74.7)
  })

  it('charges flat demo shipping under the threshold', () => {
    const totals = cartTotals([{ priceEur: 10, qty: 1 }])
    expect(totals.shippingEur).toBe(SHIPPING_FLAT_EUR)
    expect(totals.totalEur).toBe(10 + SHIPPING_FLAT_EUR)
  })

  it('offers shipping at the threshold, and on an empty cart', () => {
    expect(cartTotals([{ priceEur: SHIPPING_FREE_FROM_EUR, qty: 1 }]).shippingEur).toBe(0)
    expect(cartTotals([]).shippingEur).toBe(0)
    expect(cartTotals([]).totalEur).toBe(0)
  })
})

describe('shippingSchema — the demo address', () => {
  const valid = {
    fullName: 'Camille Dupont',
    email: 'camille@example.org',
    address: '12 rue des Épinettes',
    postalCode: '75017',
    city: 'Paris',
  }

  it('accepts a plain French address', () => {
    expect(shippingSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['a one-letter name', { ...valid, fullName: 'X' }],
    ['a bad email', { ...valid, email: 'nope' }],
    ['a four-digit postal code', { ...valid, postalCode: '7501' }],
    ['a lettered postal code', { ...valid, postalCode: '7501A' }],
  ])('refuses %s', (_label, input) => {
    expect(shippingSchema.safeParse(input).success).toBe(false)
  })

  it('parseShipping degrades garbage to null, never a crash', () => {
    expect(parseShipping('{broken')).toBeNull()
    expect(parseShipping(JSON.stringify({ fullName: 'X' }))).toBeNull()
    expect(parseShipping(JSON.stringify(valid))).toEqual(valid)
  })
})

describe('demoCardSchema — shape only, because QA needs refusal states', () => {
  it('accepts the sandbox card, spaces included', () => {
    expect(
      demoCardSchema.safeParse({ cardNumber: '4242 4242 4242 4242', expiry: '12/29', cvc: '123' })
        .success,
    ).toBe(true)
  })

  it.each([
    ['a short number', { cardNumber: '4242', expiry: '12/29', cvc: '123' }],
    ['a 13th month', { cardNumber: '4242424242424242', expiry: '13/29', cvc: '123' }],
    ['a two-digit cvc', { cardNumber: '4242424242424242', expiry: '12/29', cvc: '12' }],
  ])('refuses %s', (_label, input) => {
    expect(demoCardSchema.safeParse(input).success).toBe(false)
  })
})

describe('the demo order', () => {
  it('builds a reference that cannot be mistaken for a real order', () => {
    const reference = demoOrderReference(() => 0)
    expect(reference).toMatch(/^QA-[A-Z0-9]{6}$/)
  })

  it('round-trips through its cookie, and refuses garbage', () => {
    const order = {
      reference: 'QA-AAAAAA',
      placedAt: new Date().toISOString(),
      lines: [{ title: 'Coupe-cigare guillotine', slug: 'coupe-guillotine', qty: 1, priceEur: 24.9 }],
      totals: cartTotals([{ priceEur: 24.9, qty: 1 }]),
      shipping: {
        fullName: 'Camille Dupont',
        email: 'camille@example.org',
        address: '12 rue des Épinettes',
        postalCode: '75017',
        city: 'Paris',
      },
    }
    expect(parseDemoOrder(JSON.stringify(order))).toEqual(order)
    expect(parseDemoOrder('{broken')).toBeNull()
    expect(parseDemoOrder(JSON.stringify({ reference: 'PROD-1' }))).toBeNull()
  })
})
