import { createSupabaseServerClient } from '@/lib/supabase/server'

import { matchesShopQuery, PRICE_BRACKETS, priceBracketOf, type PriceBracketKey } from './model'

/**
 * Reads of the shop (ADR 0015 · ADR 0016).
 *
 * The rule of every query file in `lib/`: nothing here filters an audience.
 * The policies of `shop.products` decide — a draft is readable by an admin, a
 * published product by everyone — and a query that doubled one of those rules
 * would survive the day the rule changed.
 *
 * **Since migration 0034 the shop resells.** The marketplace is gone: nobody
 * sells here but us, and `shop.vendors` holds the PARTNER we bought an item
 * from — internal, admin-only, never joined into a public read. Three things
 * followed, and each was a join or a filter that had to go rather than a label
 * that had to change: a published product no longer requires an active
 * partner (the stock is ours), the shelf has no vendor facet, and there is no
 * vendor workbench to read because there is no vendor.
 *
 * The `.eq('status', …)` below are **tab filters**, the `feed_page()` word:
 * they say what a public list is about (the shop shows what is on sale), not
 * who may read. Without them, an admin browsing /boutique would see drafts —
 * readable rows that are not what the shelf is about.
 *
 * The whole public catalogue is fetched then filtered in memory: facets,
 * text search and price brackets over one query. That is a deliberate
 * ceiling, not an oversight — the ADR 0015 threshold (~200 products) reopens
 * search and pagination the day the catalogue outgrows the shelf.
 */

/**
 * A partner we buy from. Read by `/admin/boutique/partenaires` and by nothing
 * else: a supplier is our business, not the shopfront's.
 */
export type ShopVendorRow = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_path: string | null
  contact_email: string | null
  contact_phone: string | null
  legal_name: string | null
  registration: string | null
  address: string | null
  status: string
  created_at: string
}

export type ShopProductRow = {
  id: string
  category: string
  title: string
  slug: string
  brand: string | null
  description: string | null
  price_eur: number
  stock_qty: number
  image_path: string | null
  status: string
  submitted_at: string | null
  review_note: string | null
  /** The partner it was bought from, or null. Internal — see `ShopVendorRow`. */
  vendor_id: string | null
  created_at: string
}

const PRODUCT_COLUMNS =
  'id, category, title, slug, brand, description, price_eur, stock_qty, image_path, status, submitted_at, review_note, vendor_id, created_at'

/**
 * Signed URLs for a private bucket (§8 admits no public one). Works under any
 * session, anon included: `storage_shop_images_read` grants the SELECT the
 * signing needs. A path that fails to sign renders as « Sans image » rather
 * than a broken tag.
 */
export async function signShopImages(
  paths: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const real = paths.filter((p): p is string => p !== null)
  if (real.length === 0) return urls

  const db = await createSupabaseServerClient()
  const { data } = await db.storage.from('shop-images').createSignedUrls(real, 3600)
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
  }
  return urls
}

export type ShopSearchFilters = {
  q?: string
  categorie?: string
  marque?: string
  prix?: string
}

export type ShopFacets = {
  categories: Array<{ value: string; count: number }>
  brands: Array<{ value: string; count: number }>
  prices: Array<{ value: PriceBracketKey; count: number }>
}

/**
 * The shelf: every published product, then the facets counted over the full
 * shelf and the filters applied in memory. One query, consistent counts, no
 * N+1 — and the ceiling documented above.
 *
 * The « vendor » facet is gone with the marketplace: filtering a shop by who
 * we bought from is a question only our accountant asks.
 */
export async function searchShopProducts(filters: ShopSearchFilters): Promise<{
  products: ShopProductRow[]
  facets: ShopFacets
  total: number
}> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not read the shop shelf: ${error.message}`)

  const shelf = (data ?? []) as unknown as ShopProductRow[]

  const facets: ShopFacets = { categories: [], brands: [], prices: [] }
  const count = <K extends string>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1)

  const byCategory = new Map<string, number>()
  const byBrand = new Map<string, number>()
  const byPrice = new Map<PriceBracketKey, number>()
  for (const product of shelf) {
    count(byCategory, product.category)
    if (product.brand) count(byBrand, product.brand)
    count(byPrice, priceBracketOf(product.price_eur))
  }
  facets.categories = [...byCategory].map(([value, n]) => ({ value, count: n }))
  facets.brands = [...byBrand]
    .map(([value, n]) => ({ value, count: n }))
    .sort((a, b) => a.value.localeCompare(b.value, 'fr'))
  facets.prices = PRICE_BRACKETS.filter((b) => byPrice.has(b.key)).map((b) => ({
    value: b.key,
    count: byPrice.get(b.key) ?? 0,
  }))

  const products = shelf.filter((product) => {
    if (filters.categorie && product.category !== filters.categorie) return false
    if (filters.marque && product.brand !== filters.marque) return false
    if (filters.prix && priceBracketOf(product.price_eur) !== filters.prix) return false
    if (filters.q) {
      const haystack = `${product.title} ${product.brand ?? ''} ${product.description ?? ''}`
      if (!matchesShopQuery(haystack, filters.q)) return false
    }
    return true
  })

  return { products, facets, total: shelf.length }
}

/**
 * The cart's lines, resolved: the products a cookie names, restricted to what
 * is actually on sale — published, the shelf's own tab filter. A cart line
 * whose product was retracted since it was added simply comes back missing,
 * and the screens say so instead of selling a ghost.
 */
export async function getShopProductsByIds(ids: readonly string[]): Promise<ShopProductRow[]> {
  if (ids.length === 0) return []
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_COLUMNS)
    .in('id', [...ids])
    .eq('status', 'published')
  if (error) throw new Error(`Could not read the cart products: ${error.message}`)
  return (data ?? []) as unknown as ShopProductRow[]
}

/**
 * One product at its address. The published tab filter is deliberate: the
 * public address shows what is on sale, and an admin rereads a draft in
 * `/admin/boutique`.
 */
export async function getShopProductBySlug(slug: string): Promise<ShopProductRow | null> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return (data as unknown as ShopProductRow) ?? null
}
