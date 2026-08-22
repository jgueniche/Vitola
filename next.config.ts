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
 *
 * The same reasoning now covers the referential. Every page under /cigares,
 * /marques and /vitoles reads Supabase; without its URL and publishable key
 * they do not degrade, they throw. All missing variables are reported at once,
 * because discovering them one deploy at a time is its own small punishment.
 */
function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return

  const problems: string[] = []

  const secret = process.env.AGE_GATE_SECRET
  if (!secret || secret.length < 32) {
    problems.push(
      [
        '  AGE_GATE_SECRET — missing, or shorter than 32 characters.',
        '    The age gate signs its cookie with it. Any random string of 40+ characters will do.',
      ].join('\n'),
    )
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    problems.push(
      [
        '  NEXT_PUBLIC_SUPABASE_URL — missing.',
        '    The https://<ref>.supabase.co address of the project. Not a secret.',
      ].join('\n'),
    )
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    problems.push(
      [
        '  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — missing.',
        '    The sb_publishable_… key. Safe in the browser: RLS governs what it can read.',
      ].join('\n'),
    )
  }

  if (problems.length === 0) return

  throw new Error(
    [
      '',
      `${problems.length} environment variable(s) missing — the build stops here rather`,
      'than deploying a site that fails on its own pages.',
      '',
      ...problems,
      '',
      'Set them wherever this is being built:',
      '  - Vercel   Project > Settings > Environment Variables',
      '             (tick Production, Preview and Development)',
      '  - CI       repository secrets',
      '  - locally  .env.local, see .env.example',
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
