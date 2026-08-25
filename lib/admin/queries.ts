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
