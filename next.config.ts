import type { NextConfig } from 'next'

/**
 * Security headers. The Content-Security-Policy is intentionally strict from day
 * one: adding a directive later is easy, removing an exception that shipped is not.
 * `unsafe-inline` on styles is required by Next's inlined critical CSS; scripts
 * do not get it.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // A type error must break the build. Never relax this.
  // Linting is not a build step in Next 16 (`next lint` was removed): it runs
  // as its own `pnpm lint` job in CI, which is bloquant just the same.
  typescript: { ignoreBuildErrors: false },

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
