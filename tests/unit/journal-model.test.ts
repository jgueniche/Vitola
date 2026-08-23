import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ARTICLE_CATEGORIES,
  articleSlug,
  isArticleAudience,
  isArticleCategory,
  JOURNAL_LIMITS,
  readingTimeMin,
} from '@/lib/journal/model'

/** The bounds of the journal, checked against migration 0017 — the groups' rule. */

const M0017 = readFileSync(join(process.cwd(), 'supabase/migrations/0017_editorial.sql'), 'utf8')

describe('the bounds mirror migration 0017', () => {
  it('bounds a title the way articles_title_len does', () => {
    const match = /articles_title_len\s+check \(length\(btrim\(title\)\) between (\d+) and (\d+)\)/.exec(
      M0017,
    )
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBe(JOURNAL_LIMITS.titleMin)
    expect(Number(match?.[2])).toBe(JOURNAL_LIMITS.titleMax)
  })

  it('bounds excerpt, body and tags the way the CHECKs do', () => {
    expect(M0017).toContain(`length(excerpt) <= ${JOURNAL_LIMITS.excerptMax}`)
    expect(M0017).toContain(`length(body_md) between ${JOURNAL_LIMITS.bodyMin} and ${JOURNAL_LIMITS.bodyMax}`)
    expect(M0017).toContain(`array_length(tags, 1) <= ${JOURNAL_LIMITS.tagsMax}`)
    expect(M0017).toContain(
      `reading_time_min between ${JOURNAL_LIMITS.readingTimeMin} and ${JOURNAL_LIMITS.readingTimeMax}`,
    )
  })

  it('lists exactly the article_category values of the enum', () => {
    const block = /create type public\.article_category as enum \(([\s\S]*?)\);/.exec(M0017)
    expect(block).not.toBeNull()
    const declared = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect([...ARTICLE_CATEGORIES].sort()).toEqual([...declared].sort())
  })

  it('the decision rides the column name: body_md, and no mdx anywhere', () => {
    expect(M0017).toContain('body_md text not null')
    expect(M0017.toLowerCase()).not.toContain('body_mdx')
  })
})

describe('articleSlug', () => {
  it('produces what articles_slug_format accepts', () => {
    const pattern = /articles_slug_format check \(slug ~ '([^']+)'\)/.exec(M0017)
    expect(pattern).not.toBeNull()
    const check = new RegExp(pattern![1]!)
    for (const title of ['Lire une bague', "L'ère des Línea 1935", '  Nº 7 : æther  ']) {
      const slug = articleSlug(title)
      expect(slug.length).toBeGreaterThan(0)
      expect(slug, `"${title}" gave "${slug}"`).toMatch(check)
    }
    expect(articleSlug('!!!')).toBe('')
  })
})

describe('readingTimeMin', () => {
  it('is one minute at least, and grows with the words', () => {
    expect(readingTimeMin('Deux mots.')).toBe(1)
    const words = Array.from({ length: 450 }, (_, index) => `mot${index}`).join(' ')
    expect(readingTimeMin(words)).toBe(3)
  })
})

describe('the guards', () => {
  it('accept the enums and refuse the rest', () => {
    expect(isArticleCategory('lexique')).toBe(true)
    expect(isArticleCategory('promo')).toBe(false)
    expect(isArticleAudience('gated')).toBe(true)
    expect(isArticleAudience('secret')).toBe(false)
  })
})
