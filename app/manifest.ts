import type { MetadataRoute } from 'next'

import { BRAND } from '@/lib/brand'
import { THEME_COLOR_DARK } from '@/lib/theme'

/**
 * The web app manifest — the PWA half of P8 that is worth shipping now.
 *
 * What it makes true: the site is installable (Chromium requires a manifest,
 * a 192+ icon and HTTPS — no service worker since 2023), it opens standalone
 * on the house ground, and the tile carries the brand from `lib/brand.ts`
 * like everything else.
 *
 * What it deliberately does NOT include: a service worker. Offline caching on
 * this site means caching pages that live behind the age gate, keyed by a
 * cookie the cache does not understand — a stale-while-revalidate of someone's
 * notebook is a privacy bug dressed as a feature. The day offline matters
 * (P4's scan queue is the credible customer), the worker arrives with a cache
 * policy written for the gate, not before.
 *
 * `start_url` is the landing: the one page that is everyone's, gate or not.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    lang: BRAND.defaultLanguage,
    start_url: '/',
    display: 'standalone',
    background_color: THEME_COLOR_DARK,
    theme_color: THEME_COLOR_DARK,
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/icon', sizes: '192x192', type: 'image/png' },
    ],
  }
}
