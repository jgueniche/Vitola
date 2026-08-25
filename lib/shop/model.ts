import { z } from 'zod'

import { isShopTextAllowed } from '@/lib/compliance/tobacco-terms'
import { m } from '@/lib/i18n'
import { Constants } from '@/lib/supabase/database.types'

/**
 * The shared shape of a product form (ADR 0015 for the admin, ADR 0016 for
 * the vendor space): both screens edit the same fields under the same bounds,
 * so the schema lives once, here, and the two `actions.ts` import it. The
 * bounds duplicate migration 0021/0022 CHECKs on purpose — a CHECK refuses in
 * `23514`, which is a sentence for nobody (the reviews/model.ts rule).
 */

export const PRODUCT_IMAGE_MIME = ['image/webp', 'image/jpeg', 'image/png', 'image/avif']
export const PRODUCT_IMAGE_MAX_BYTES = 8_388_608

export const productSchema = z.object({
  category: z.enum(Constants.shop.Enums.product_category, m.admin.errors.categoryNeeded),
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, m.admin.errors.productTitleNeeded).max(140, m.admin.errors.tooLong)),
  /* Who makes it (ADR 0016, D5) — optional, never the cigar referential. */
  brand: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(2, m.admin.errors.brandLen).max(80, m.admin.errors.brandLen))
      .nullable(),
  ),
  description: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(4000, m.admin.errors.tooLong))
      .nullable(),
  ),
  /* The French keyboard types a comma; refusing 24,90 over a dot would make
     the person feeding a catalogue retype every price. */
  price: z.preprocess(
    (value) => Number.parseFloat(String(value ?? '').replace(',', '.')),
    z
      .number(m.admin.errors.priceRange)
      .min(0.01, m.admin.errors.priceRange)
      .max(99999.99, m.admin.errors.priceRange),
  ),
  stock: z.preprocess(
    (value) => Number.parseInt(String(value ?? '0') || '0', 10),
    z
      .number(m.admin.errors.stockRange)
      .int(m.admin.errors.stockRange)
      .min(0, m.admin.errors.stockRange)
      .max(100000, m.admin.errors.stockRange),
  ),
})

export type ProductInput = z.infer<typeof productSchema>

export function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    category: formData.get('category'),
    title: formData.get('title'),
    brand: formData.get('brand'),
    description: formData.get('description'),
    price: formData.get('price'),
    stock: formData.get('stock'),
  })
}

/** The screen half of D2 (0015): the trigger's refusal, as a French sentence. */
export function refuseTobaccoWording(
  title: string,
  brand: string | null,
  description: string | null,
): string | null {
  return isShopTextAllowed(`${title} ${brand ?? ''} ${description ?? ''}`)
    ? null
    : m.admin.errors.titleRefused
}

/** Null when no usable file was submitted; a sentence when one was and is invalid. */
export function readProductImage(formData: FormData): { file: File | null; error: string | null } {
  const raw = formData.get('image')
  if (!(raw instanceof File) || raw.size === 0) return { file: null, error: null }
  if (!PRODUCT_IMAGE_MIME.includes(raw.type) || raw.size > PRODUCT_IMAGE_MAX_BYTES) {
    return { file: null, error: m.admin.errors.imageInvalid }
  }
  return { file: raw, error: null }
}

/** `24.9` → « 24,90 € » — the one price format of the shop. */
export function formatPrice(eur: number): string {
  return `${eur.toFixed(2).replace('.', ',')} €`
}

/**
 * The price facet of /boutique: four fixed brackets, as links (the /cigares
 * pattern). A bracket is a URL value, so it must be stable and readable in
 * the address bar.
 */
export const PRICE_BRACKETS = [
  { key: 'moins-25', min: 0, max: 25 },
  { key: '25-50', min: 25, max: 50 },
  { key: '50-100', min: 50, max: 100 },
  { key: 'plus-100', min: 100, max: Number.POSITIVE_INFINITY },
] as const

export type PriceBracketKey = (typeof PRICE_BRACKETS)[number]['key']

export function priceBracketOf(eur: number): PriceBracketKey {
  const bracket = PRICE_BRACKETS.find((b) => eur >= b.min && eur < b.max)
  return (bracket ?? PRICE_BRACKETS[PRICE_BRACKETS.length - 1]!).key
}

/**
 * Accent-folded, lowercased needle-in-haystack for the /boutique text search.
 * The catalogue has no search_vector (the ADR 0015 threshold: search grows up
 * at ~200 products); until then the list is filtered in memory, and folding
 * here keeps « etui » finding « Étui » — the referential's lesson, applied to
 * a much smaller haystack.
 */
export function matchesShopQuery(haystack: string, query: string): boolean {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  return fold(haystack).includes(fold(query.trim()))
}
