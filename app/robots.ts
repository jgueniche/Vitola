import type { MetadataRoute } from 'next'

import { PUBLIC_PATHS, PUBLIC_PREFIXES } from '@/lib/routes'
import { SITE_INDEXABLE } from '@/lib/site'

/**
 * Nothing is indexable until Q1 signs off — then exactly the Q13 split.
 *
 * The lever is `SITE_INDEXABLE` (lib/site.ts), one environment variable on the
 * deployment. Closed (the default), this is a full disallow: an accidentally
 * indexed page about tobacco is not something a `noindex` added later can
 * retract from a search engine's cache. Open, the public routes — and only
 * they — are allowed: the gate's boundary and the crawler's boundary are the
 * same list, read from the same file, so they cannot drift apart.
 *
 * `allow` + `disallow: '/'` relies on longest-match precedence, which the
 * major crawlers honour; a crawler that does not simply indexes nothing,
 * which is the safe direction.
 */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_INDEXABLE) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  const allow = [
    ...PUBLIC_PATHS.filter((path) => path !== '/auth/callback' && path !== '/majorite'),
    ...PUBLIC_PREFIXES,
  ]
  return {
    rules: [{ userAgent: '*', allow, disallow: '/' }],
  }
}
