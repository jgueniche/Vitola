import { createSupabaseServerClient } from '@/lib/supabase/server'

import type { ArticleAudience, ArticleCategory, ArticleStatus } from './model'

/**
 * Reads of the journal (ADR 0012).
 *
 * The usual rule, with the usual nuance. Nothing here decides who reads a
 * DRAFT — `articles_select_published` and `articles_select_editor` do. What
 * this file does filter is the **audience**, and that is not an RLS double:
 * `public` vs `gated` is not a right, it is the Q13 frontier — an HTTP-level,
 * legal boundary tied to the age-gate cookie, which the database has never
 * heard of. The page holds the cookie; these queries take `includeGated` from
 * it and nothing else.
 */

export type ArticleRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_md: string
  category: ArticleCategory
  tags: string[]
  audience: ArticleAudience
  status: ArticleStatus
  author_id: string | null
  reading_time_min: number | null
  published_at: string | null
  created_at: string
  updated_at: string
}

const ARTICLE_COLUMNS =
  'id, slug, title, excerpt, body_md, category, tags, audience, status, author_id, ' +
  'reading_time_min, published_at, created_at, updated_at'

/** The published journal, newest first. `includeGated` is the gate cookie. */
export async function listJournal(options: { includeGated: boolean }): Promise<ArticleRow[]> {
  const supabase = await createSupabaseServerClient()
  let query = supabase
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)

  if (!options.includeGated) query = query.eq('audience', 'public')

  const { data, error } = await query
  if (error) throw new Error(`Could not read the journal: ${error.message}`)
  return (data ?? []) as unknown as ArticleRow[]
}

/** The drafts the RLS serves this caller — everything for an editor, nothing else. */
export async function listDrafts(): Promise<ArticleRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Could not read the drafts: ${error.message}`)
  return (data ?? []) as unknown as ArticleRow[]
}

/** One article at its address. No status predicate: the RLS is the audience. */
export async function getArticleBySlug(slug: string): Promise<ArticleRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Could not read the article: ${error.message}`)
  return (data as unknown as ArticleRow) ?? null
}

export type ArticleLink = {
  id: string
  cigar: { slug: string; name: string; brand: string | null } | null
  venue: { slug: string; name: string } | null
}

/** What a (gated) article points at, hydrated in two fixed queries. */
export async function listArticleLinks(articleId: string): Promise<ArticleLink[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('article_links')
    .select('id, cigar_id, venue_id')
    .eq('article_id', articleId)

  if (error) throw new Error(`Could not read the article links: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []

  const cigarIds = rows.map((row) => row.cigar_id).filter((id): id is string => !!id)
  const venueIds = rows.map((row) => row.venue_id).filter((id): id is string => !!id)

  const [cigars, venues] = await Promise.all([
    cigarIds.length
      ? supabase
          .schema('ref')
          .from('cigars')
          .select('id, slug, commercial_name, brands(name)')
          .in('id', cigarIds)
      : Promise.resolve({ data: [] }),
    venueIds.length
      ? supabase.from('venues').select('id, slug, name').in('id', venueIds)
      : Promise.resolve({ data: [] }),
  ])

  const cigarById = new Map(
    (
      (cigars.data ?? []) as unknown as {
        id: string
        slug: string
        commercial_name: string
        brands: { name: string } | null
      }[]
    ).map((cigar) => [cigar.id, cigar]),
  )
  const venueById = new Map(
    ((venues.data ?? []) as { id: string; slug: string; name: string }[]).map((venue) => [
      venue.id,
      venue,
    ]),
  )

  return rows.map((row) => {
    const cigar = row.cigar_id ? cigarById.get(row.cigar_id) : undefined
    const venue = row.venue_id ? venueById.get(row.venue_id) : undefined
    return {
      id: row.id,
      cigar: cigar
        ? { slug: cigar.slug, name: cigar.commercial_name, brand: cigar.brands?.name ?? null }
        : null,
      venue: venue ? { slug: venue.slug, name: venue.name } : null,
    }
  })
}

/**
 * The public feed, for the sitemap and the RSS route. Best effort: the CI
 * build renders against a stand-in Supabase URL where every query throws, and
 * a sitemap that fails to build is worse than one missing its articles.
 */
export async function publicPublishedArticles(): Promise<
  Pick<ArticleRow, 'slug' | 'title' | 'excerpt' | 'published_at' | 'updated_at' | 'category'>[]
> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('articles')
      .select('slug, title, excerpt, published_at, updated_at, category')
      .eq('status', 'published')
      .eq('audience', 'public')
      .order('published_at', { ascending: false })
      .limit(100)
    return (data ?? []) as unknown as Pick<
      ArticleRow,
      'slug' | 'title' | 'excerpt' | 'published_at' | 'updated_at' | 'category'
    >[]
  } catch {
    return []
  }
}

/** One article by id — the composer's edit mode. RLS serves drafts to editors. */
export async function getArticleById(id: string): Promise<ArticleRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not read the article: ${error.message}`)
  return (data as unknown as ArticleRow) ?? null
}
