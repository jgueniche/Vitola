/**
 * The journal, as rules rather than as queries (ADR 0012).
 *
 * Pure, like every model file here. The bounds mirror migration 0017's CHECK
 * constraints and are pinned by `tests/unit/journal-model.test.ts`; the slug is
 * the club rule again; and `readingTimeMin` is the one derivation — computed at
 * write time from the body, never typed, for the reason a tasting's total is
 * never typed: a number somebody can overwrite is a number that lies.
 */

import type { Database } from '@/lib/supabase/database.types'

export type ArticleCategory = Database['public']['Enums']['article_category']
export type ArticleAudience = Database['public']['Enums']['article_audience']
export type ArticleStatus = Database['public']['Enums']['article_status']

export const JOURNAL_LIMITS = {
  titleMin: 2,
  titleMax: 160,
  excerptMax: 300,
  bodyMin: 1,
  bodyMax: 40000,
  tagsMax: 8,
  readingTimeMin: 1,
  readingTimeMax: 120,
} as const

export const ARTICLE_CATEGORIES = [
  'guide',
  'interview',
  'reportage',
  'lexique',
  'actualite',
  'accord',
] as const satisfies readonly ArticleCategory[]

export function isArticleCategory(value: unknown): value is ArticleCategory {
  return typeof value === 'string' && (ARTICLE_CATEGORIES as readonly string[]).includes(value)
}

export const ARTICLE_AUDIENCES = ['public', 'gated'] as const satisfies readonly ArticleAudience[]

export function isArticleAudience(value: unknown): value is ArticleAudience {
  return typeof value === 'string' && (ARTICLE_AUDIENCES as readonly string[]).includes(value)
}

/** The club slug rule, without a city: an article title is already specific. */
export function articleSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '')
}

/**
 * Minutes of reading, from the body, at 200 words a minute — the low end of
 * the usual range, because an article here carries terminology. Clamped to the
 * CHECK's bounds so what this returns is always what the table accepts.
 */
export function readingTimeMin(bodyMd: string): number {
  const words = bodyMd
    .replace(/[#>*_\-[\]()]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0).length
  return Math.min(
    JOURNAL_LIMITS.readingTimeMax,
    Math.max(JOURNAL_LIMITS.readingTimeMin, Math.ceil(words / 200)),
  )
}

/** What a gesture leaves in the URL — the `?fait=…` rule of the groups. */
export const JOURNAL_DONE = {
  saved: 'enregistre',
  published: 'publie',
  unpublished: 'depublie',
  deleted: 'supprime',
  linked: 'liee',
  unlinked: 'retiree',
} as const
