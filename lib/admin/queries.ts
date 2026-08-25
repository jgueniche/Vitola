import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

/**
 * Reads of the admin area (ADR 0014).
 *
 * Everything here runs on the caller's session, under policies that already
 * exist: `profiles_select_directory` shows every profile to a moderator+,
 * `cigars_select_published` shows drafts to an editor, `lines_select_editor`
 * shows draft lines. Nothing states a visibility rule — the predicates below
 * are tab filters in the `feed_page()` sense: they say what a number or a list
 * is about, never who may read.
 */

const PAGE = 50

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export type AdminCounts = {
  revisionsPending: number
  venuesPending: number
  articleDrafts: number
  sheetsPublished: number
  sheetsUnreviewed: number
  sheetsDraft: number
  linesTotal: number
  linesDraft: number
  accounts: number
  productsTotal: number
  productsDraft: number
  productsPublished: number
  productsSubmitted: number
  vendorsActive: number
  vendorsPending: number
  vendorsSuspended: number
}

export async function adminCounts(): Promise<AdminCounts> {
  const [db, ref] = await Promise.all([createSupabaseServerClient(), referential()])

  const count = async (query: PromiseLike<{ count: number | null }>) =>
    (await query).count ?? 0

  const [
    revisionsPending,
    venuesPending,
    articleDrafts,
    sheetsPublished,
    sheetsUnreviewed,
    sheetsDraft,
    linesTotal,
    linesDraft,
    accounts,
    productsTotal,
    productsDraft,
    productsPublished,
    productsSubmitted,
    vendorsActive,
    vendorsPending,
    vendorsSuspended,
  ] = await Promise.all([
    count(ref.from('cigar_revisions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(db.from('venues').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(db.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    count(ref.from('cigars').select('id', { count: 'exact', head: true }).eq('status', 'published')),
    count(
      ref
        .from('cigars')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .is('verified_by', null),
    ),
    count(ref.from('cigars').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    count(ref.from('lines').select('id', { count: 'exact', head: true })),
    count(ref.from('lines').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    count(db.from('profiles').select('id', { count: 'exact', head: true })),
    count(db.schema('shop').from('products').select('id', { count: 'exact', head: true })),
    count(
      db.schema('shop').from('products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ),
    count(
      db.schema('shop').from('products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    ),
    /* The review queue of the vendor flow (ADR 0016, D3): a draft that has
       been submitted and not yet decided. */
    count(
      db
        .schema('shop')
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .not('submitted_at', 'is', null),
    ),
    count(
      db.schema('shop').from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ),
    count(
      db.schema('shop').from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ),
    count(
      db
        .schema('shop')
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'suspended'),
    ),
  ])

  return {
    revisionsPending,
    venuesPending,
    articleDrafts,
    sheetsPublished,
    sheetsUnreviewed,
    sheetsDraft,
    linesTotal,
    linesDraft,
    accounts,
    productsTotal,
    productsDraft,
    productsPublished,
    productsSubmitted,
    vendorsActive,
    vendorsPending,
    vendorsSuspended,
  }
}

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

export type FlagRow = {
  key: string
  enabled: boolean
  description: string
  payload: Record<string, unknown>
  updated_at: string
}

export async function listFlags(): Promise<FlagRow[]> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db.from('feature_flags').select('*').order('key')
  if (error) throw new Error(`Could not read the flags: ${error.message}`)
  return (data ?? []) as FlagRow[]
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

export type AccountRow = {
  id: string
  handle: string
  display_name: string | null
  role: string
  reputation: number
  is_discoverable: boolean
  created_at: string
}

/**
 * Newest first: the account an admin looks for is usually the one that just
 * arrived. The search is a filter on what the page shows; the reason an admin
 * sees non-discoverable profiles at all is `profiles_select_directory`.
 */
export async function listAccounts(search: string): Promise<AccountRow[]> {
  const db = await createSupabaseServerClient()
  let query = db
    .from('profiles')
    .select('id, handle, display_name, role, reputation, is_discoverable, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE)

  /* Commas and parentheses are PostgREST `or=` syntax, not search text: kept,
     they would turn a typed name into a filter expression that errors out. */
  const term = search.trim().replace(/[,()]/g, ' ').trim()
  if (term !== '') {
    query = query.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Could not read the accounts: ${error.message}`)
  return (data ?? []) as AccountRow[]
}

/* -------------------------------------------------------------------------- */
/* Sheets — the review backlog                                                 */
/* -------------------------------------------------------------------------- */

export const SHEET_FILTERS = ['non-relues', 'brouillons', 'publiees'] as const
export type SheetFilter = (typeof SHEET_FILTERS)[number]

export type SheetRow = {
  id: string
  slug: string
  commercial_name: string
  status: string
  verified_at: string | null
  verified_by: string | null
  brands: { name: string } | null
}

export async function listSheets(filter: SheetFilter, search: string): Promise<SheetRow[]> {
  const ref = await referential()
  let query = ref
    .from('cigars')
    .select('id, slug, commercial_name, status, verified_at, verified_by, brands(name)')
    .order('commercial_name')
    .limit(PAGE)

  if (filter === 'non-relues') query = query.eq('status', 'published').is('verified_by', null)
  if (filter === 'brouillons') query = query.eq('status', 'draft')
  if (filter === 'publiees') query = query.eq('status', 'published')

  const term = search.trim()
  if (term !== '') query = query.ilike('commercial_name', `%${term}%`)

  const { data, error } = await query
  if (error) throw new Error(`Could not read the sheets: ${error.message}`)
  return (data ?? []) as unknown as SheetRow[]
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

export type AdminLineRow = {
  id: string
  name: string
  slug: string
  status: string
  brands: { name: string } | null
}

export async function listAllLines(): Promise<AdminLineRow[]> {
  const ref = await referential()
  const { data, error } = await ref
    .from('lines')
    .select('id, name, slug, status, brands(name)')
    .order('name')
  if (error) throw new Error(`Could not read the lines: ${error.message}`)
  return (data ?? []) as unknown as AdminLineRow[]
}

export type BrandOption = { id: string; name: string }

export async function listBrandOptions(): Promise<BrandOption[]> {
  const ref = await referential()
  const { data, error } = await ref.from('brands').select('id, name').order('name')
  if (error) throw new Error(`Could not read the brands: ${error.message}`)
  return (data ?? []) as BrandOption[]
}

/* -------------------------------------------------------------------------- */
/* Shop catalogue (ADR 0015)                                                   */
/* -------------------------------------------------------------------------- */

export type ProductRow = {
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

/**
 * The whole catalogue, newest first — `products_select_admin` is why drafts
 * and archived rows come back at all. With an image, a signed URL rides along:
 * the bucket is private (§8 admits no public bucket), so a path alone renders
 * nothing.
 */
export async function listProducts(): Promise<Array<ProductRow & { imageUrl: string | null }>> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .schema('shop')
    .from('products')
    .select(
      'id, category, title, slug, brand, description, price_eur, stock_qty, image_path, status, submitted_at, review_note, vendor_id, created_at, vendor:vendors(name, slug)',
    )
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not read the catalogue: ${error.message}`)

  const rows = (data ?? []) as unknown as ProductRow[]
  const paths = rows.map((row) => row.image_path).filter((p): p is string => p !== null)
  const urls = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await db.storage.from('shop-images').createSignedUrls(paths, 3600)
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
    }
  }
  return rows.map((row) => ({
    ...row,
    imageUrl: row.image_path ? (urls.get(row.image_path) ?? null) : null,
  }))
}

/* -------------------------------------------------------------------------- */
/* Marketplace vendors (ADR 0016)                                              */
/* -------------------------------------------------------------------------- */

export type AdminVendorRow = {
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
  ownerHandle: string | null
  productCount: number
}

/**
 * Every vendor, for /admin/boutique/vendeurs — `vendors_select_admin` is why
 * pending and suspended rows come back. The owner handle is hydrated in a
 * second query (owner_id points at auth.users, not profiles, so no embed),
 * under `profiles_select_directory` — the notebook pattern, never an N+1.
 */
export async function listVendors(): Promise<AdminVendorRow[]> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db
    .schema('shop')
    .from('vendors')
    .select('*, products(count)')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read the vendors: ${error.message}`)

  const rows = (data ?? []) as unknown as Array<
    Omit<AdminVendorRow, 'ownerHandle' | 'productCount'> & { products: Array<{ count: number }> }
  >

  const ownerIds = rows.map((row) => row.owner_id).filter((id): id is string => id !== null)
  const handles = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('id, handle').in('id', ownerIds)
    for (const profile of profiles ?? []) handles.set(profile.id, profile.handle)
  }

  return rows.map(({ products, ...row }) => ({
    ...row,
    ownerHandle: row.owner_id ? (handles.get(row.owner_id) ?? null) : null,
    productCount: products[0]?.count ?? 0,
  }))
}

export type VendorOption = { id: string; name: string; slug: string }

/**
 * The create-product select: which shopfront receives the product. The house
 * comes first — it is the default an admin means when feeding the catalogue,
 * and a default that silently lands products on a partner's shelf would be a
 * gift nobody asked for.
 */
export async function listVendorOptions(): Promise<VendorOption[]> {
  const db = await createSupabaseServerClient()
  const { data, error } = await db.schema('shop').from('vendors').select('id, name, slug').order('name')
  if (error) throw new Error(`Could not read the vendor options: ${error.message}`)
  const options = (data ?? []) as VendorOption[]
  return options.sort((a, b) =>
    a.slug === 'vitola' ? -1 : b.slug === 'vitola' ? 1 : a.name.localeCompare(b.name, 'fr'),
  )
}
