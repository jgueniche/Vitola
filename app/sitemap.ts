import type { MetadataRoute } from 'next'

import { PUBLIC_PATHS } from '@/lib/routes'
import { SITE_ORIGIN } from '@/lib/site'

/**
 * The sitemap, and the one rule that decides everything in it: **it lists only
 * what is reachable without clearing the age gate.**
 *
 * Not one cigar sheet, not one brand, not one vitola. A sitemap is fetched by
 * anybody, cached by anybody and quoted by anybody, so a sitemap listing 940
 * cigar URLs publishes 114 brand names to exactly the audience the age gate
 * exists to keep them from — and it does so in a file that survives the page
 * that would have refused them. §2 of the brief calls that promotion; the gate
 * would still refuse the click, and the harm would already have happened.
 *
 * `PUBLIC_PATHS` is therefore the source, not a hand-written list. It is the
 * same array the middleware reads to decide what the gate lets through, so the
 * sitemap cannot drift from the boundary it is describing: a route that becomes
 * gated leaves this file the moment it leaves that one.
 *
 * Two entries are dropped even from that list, because they are mechanisms
 * rather than pages: `/majorite` is the gate itself, and `/auth/callback` is a
 * one-time redirect that answers with a 307 to anybody without a token.
 *
 * **`robots.ts` currently disallows everything**, so nothing here is crawled at
 * all today (Q1). That is not a reason to leave the file empty or to list more
 * than it should: the day the legal review is signed off, the allow rule
 * changes in one place and this file is already correct.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const MECHANISMS = ['/majorite', '/auth/callback']

  return PUBLIC_PATHS.filter((path) => !MECHANISMS.includes(path)).map((path) => ({
    url: new URL(path, SITE_ORIGIN).toString(),
    lastModified: new Date(),
    changeFrequency: path === '/' ? ('weekly' as const) : ('monthly' as const),
    priority: path === '/' ? 1 : 0.5,
  }))
}
