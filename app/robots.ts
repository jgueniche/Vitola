import type { MetadataRoute } from 'next'

/**
 * Nothing is indexable yet.
 *
 * §2 of the brief makes the legal review blocking before public exposure, and
 * Q1 leaves it open. Until it is signed off, the safest default is a full
 * disallow: an accidentally indexed page about tobacco is not something a
 * `noindex` added later can retract from a search engine's cache.
 *
 * P6 replaces this with a real policy: `app/(public)/` indexable,
 * `app/(app)/` disallowed (see Q13).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
