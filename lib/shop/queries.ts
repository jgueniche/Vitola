import { createSupabaseServerClient } from '@/lib/supabase/server'

import { matchesShopQuery, PRICE_BRACKETS, priceBracketOf, type PriceBracketKey } from './model'

/**
 * Reads of the shop (ADR 0015 · ADR 0016).
 *
 * The rule of every query file in `lib/`: nothing here filters an audience.
 * The policies of `shop.products` and `shop.vendors` decide — a draft is
 * readable by its vendor and the admin, a published product by everyone
 * *while its vendor is active*, and a query that doubled one of those rules
 * would survive the day the rule changed.
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
  owner_id: string | null
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
  vendor_id: string
  created_at: string
  vendor: { name: string; slug: string } | null
}

const PRODUCT_COLUMNS =
  'id, category, title, slug, brand, description, price_eur, stock_qty, image_path, status, submitted_at, review_note, vendor_id, created_at'

const PRODUCT_WITH_VENDOR = `${PRODUCT_COLUMNS}, vendor:vendors(name, slug)`

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
  vendeur?: string
  prix?: string
}

export type ShopFacets = {
  categories: Array<{ value: string; count: number }>
  brands: Array<{ value: string; count: number }>
  vendors: Array<{ value: string; slug: string; count: number }>
  prices: Array<{ value: PriceBracketKey; count: number }>
}

/**
 * The shelf: every published product of every active vendor, then the facets
 * counted over the full shelf and the filters applied in memory. One query,
 * consistent counts, no N+1 — and the ceiling documented above.
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
    .select(`${PRODUCT_COLUMNS}, vendor:vendors!inner(name, slug, status)`)
    .eq('status', 'published')
    .eq('vendor.status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not read the shop shelf: ${error.message}`)

  const shelf = (data ?? []) as unknown as Array<
    Omit<ShopProductRow, 'vendor'> & { vendor: { name: string; slug: string; status: string } }
  >

  const facets: ShopFacets = { categories: [], brands: [], vendors: [], prices: [] }
  const count = <K extends string>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1)

  const byCategory = new Map<string, number>()
  const byBrand = new Map<string, number>()
  const byVendor = new Map<string, { slug: string; count: number }>()
  const byPrice = new Map<PriceBracketKey, number>()
  for (const product of shelf) {
    count(byCategory, product.category)
    if (product.brand) count(byBrand, product.brand)
    const vendorEntry = byVendor.get(product.vendor.name)
    byVendor.set(product.vendor.name, {
      slug: product.vendor.slug,
      count: (vendorEntry?.count ?? 0) + 1,
    })
    count(byPrice, priceBracketOf(product.price_eur))
  }
  facets.categories = [...byCategory].map(([value, n]) => ({ value, count: n }))
  facets.brands = [...byBrand]
    .map(([value, n]) => ({ value, count: n }))
    .sort((a, b) => a.value.localeCompare(b.value, 'fr'))
  facets.vendors = [...byVendor]
    .map(([value, entry]) => ({ value, slug: entry.slug, count: entry.count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'fr'))
  facets.prices = PRICE_BRACKETS.filter((b) => byPrice.has(b.key)).map((b) => ({
    value: b.key,
    count: byPrice.get(b.key) ?? 0,
  }))

  const products = shelf.filter((product) => {
    if (filters.categorie && product.category !== filters.categorie) return false
    if (filters.marque && product.brand !== filters.marque) return false
    if (filters.vendeur && product.vendor.slug !== filters.vendeur) return false
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
 * One product at its address. The published tab filter is deliberate: the
 * public address shows what is on sale — a vendor rereads their draft in
 * /vendeur, not here. The vendor embed is not `!inner` on status: the RLS of
 * `products_select_published` already refuses the row of a suspended vendor,
 * and doubling it here is the tab filter's job only on lists.
 */
export async function getShopProductBySlug(slug: string): Promise<ShopProductRow | null> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_WITH_VENDOR)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return (data as unknown as ShopProductRow) ?? null
}

/** A shopfront at its address — active vendors only, the public tab. */
export async function getShopVendorBySlug(slug: string): Promise<ShopVendorRow | null> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .schema('shop')
    .from('vendors')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  return (data as ShopVendorRow) ?? null
}

/** The shopfront's shelf: their published products, newest first. */
export async function listVendorShelf(vendorId: string): Promise<ShopProductRow[]> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_WITH_VENDOR)
    .eq('vendor_id', vendorId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as ShopProductRow[]
}

/**
 * « Ma boutique » — the vendor space's first question. The `.eq` is not an
 * audience filter: an admin's session reads every vendor, so « which one is
 * mine » is a question the RLS cannot answer alone (the club-membership
 * pattern of social/group-queries.ts).
 */
export async function getMyVendor(userId: string): Promise<ShopVendorRow | null> {
  const db = await createSupabaseServerClient()
  const { data } = await db
    .schema('shop')
    .from('vendors')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle()
  return (data as ShopVendorRow) ?? null
}

/** Everything on my workbench, whatever the status — drafts first. */
export async function listMyVendorProducts(vendorId: string): Promise<ShopProductRow[]> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .schema('shop')
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not read the vendor workbench: ${error.message}`)
  return ((data ?? []) as unknown as Array<Omit<ShopProductRow, 'vendor'>>).map((row) => ({
    ...row,
    vendor: null,
  }))
}
