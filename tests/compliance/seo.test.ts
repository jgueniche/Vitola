import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { PUBLIC_PATHS, isPublicPath } from '@/lib/routes'

/**
 * What the site says about itself to machines.
 *
 * Everything asserted here is a §2 boundary rather than an SEO preference. A
 * sitemap, a robots file and an OG card share one property that makes them
 * dangerous: **they are fetched by parties who have not cleared the age gate
 * and cannot.** A crawler, a chat client generating a preview, a cache. Whatever
 * they carry is published to that audience, and it outlives the page that would
 * have refused them.
 *
 * So the rule is not "index the right things". It is: nothing behind the gate
 * may be named in a file in front of it.
 */

describe('the sitemap stays in front of the gate', () => {
  /* Async since P6: the sitemap now appends the journal's PUBLIC articles.
     In this test run the database is unreachable, `publicPublishedArticles`
     degrades to nothing, and what is asserted below is the static boundary —
     which is exactly the part that must never depend on data. */
  let entries: Awaited<ReturnType<typeof sitemap>> = []
  beforeAll(async () => {
    entries = await sitemap()
  })

  it('lists something, so the assertions below are not vacuous', () => {
    expect(entries.length).toBeGreaterThan(3)
  })

  it('lists only paths the age gate lets through', () => {
    for (const entry of entries) {
      const path = new URL(entry.url).pathname
      expect(isPublicPath(path), `${path} est derrière le portail`).toBe(true)
    }
  })

  it('names no cigar, no brand and no vitola', () => {
    // The failure this prevents: somebody adds `ref.cigars` to the sitemap to
    // help indexing, and publishes 114 brand names to everybody.
    const joined = entries.map((entry) => entry.url).join(' ')
    for (const segment of ['/cigares/', '/marques/', '/vitoles/', '/carnet', '/cave']) {
      expect(joined).not.toContain(segment)
    }
  })

  it('omits the gate, the auth callback and the health probe', () => {
    // Mechanisms, not pages: one is the gate, one answers 307 to anybody
    // without a token, and one returns JSON to a monitor. A sitemap answers
    // "what would somebody want to land on", and none of the three qualifies.
    const paths = entries.map((entry) => new URL(entry.url).pathname)
    expect(paths).not.toContain('/majorite')
    expect(paths).not.toContain('/auth/callback')
    expect(paths).not.toContain('/api/health')
    expect(PUBLIC_PATHS).toContain('/majorite')
  })

  it('lists no route that answers in JSON', () => {
    // The general form of the rule above: /api/ is a dialect, not a page.
    for (const entry of entries) {
      expect(new URL(entry.url).pathname.startsWith('/api/')).toBe(false)
    }
  })

  it('resolves against a real origin, never localhost', () => {
    // Without `metadataBase` Next resolves og:image against localhost:3000 in a
    // production build. The sitemap shares the origin, so it shares the guard.
    for (const entry of entries) {
      expect(entry.url).not.toContain('localhost')
      expect(entry.url.startsWith('https://')).toBe(true)
    }
  })
})

describe('robots stays closed until Q1 is settled', () => {
  it('disallows everything', () => {
    // §2 makes the legal review blocking. An accidentally indexed page about
    // tobacco is not something a later `noindex` retracts from a cache.
    const rules = robots().rules
    const list = Array.isArray(rules) ? rules : [rules]
    expect(list.some((rule) => rule.disallow === '/')).toBe(true)
    expect(list.some((rule) => rule.allow !== undefined)).toBe(false)
  })
})

describe('the OG card carries the site, never a product', () => {
  const source = readFileSync(join(process.cwd(), 'app/opengraph-image.tsx'), 'utf8')

  it('exists at the app root, so gated routes inherit it', () => {
    // A per-sheet card is the obvious thing to build and the thing that must
    // not exist: a preview naming a cigar is a preview nobody cleared a gate to
    // see. Being at the root is what makes the neutral card the default.
    expect(source).toContain('export default function OpengraphImage')
  })

  it('names no brand of cigar', () => {
    for (const forbidden of ['Cohíba', 'Cohiba', 'Montecristo', 'Partagás', 'Undercrown']) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('carries the disclaimer, because the card travels further than the page', () => {
    expect(source).toContain('BRAND.disclaimer')
  })

  it('takes its colours from the one file allowed to hold them', () => {
    // check-tokens.ts allowlists lib/theme.ts and nothing else; an image cannot
    // read a CSS custom property, which is why that exception exists at all.
    expect(source).toContain('THEME_COLOR_DARK')
    expect(source).not.toMatch(/#[0-9a-fA-F]{6}/)
  })
})
