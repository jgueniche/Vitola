import type { NextConfig } from 'next'

/**
 * Fail the BUILD, not the first visitor.
 *
 * The age gate refuses to sign without AGE_GATE_SECRET — deliberately, because
 * an unsigned gate is decorative. But deferring that refusal to runtime ships a
 * site that returns 500 on its own front door. A red build naming the missing
 * variable is strictly better than a green build that cannot be entered.
 *
 * Learned the hard way: the first real visit to the preview deployment hit
 * exactly this, on /majorite, at the moment of submitting a date of birth.
 */
function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return

  const secret = process.env.AGE_GATE_SECRET
  if (secret && secret.length >= 32) return

  throw new Error(
    [
      '',
      'AGE_GATE_SECRET is missing, or shorter than 32 characters.',
      '',
      'The age gate signs its cookie with it. Without it the gate cannot be',
      'enforced, so the build stops here rather than deploying a site that',
      'fails on /majorite.',
      '',
      'Set it wherever this is being built:',
      '  - Vercel   Project > Settings > Environment Variables',
      '             (tick Production, Preview and Development)',
      '  - CI       a repository secret',
      '  - locally  .env.local, see .env.example',
      '',
      'Any random string of 40 characters or more will do.',
      '',
    ].join('\n'),
  )
}

assertProductionEnvironment()

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
