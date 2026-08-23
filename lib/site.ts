/**
 * The origin the site answers on, for the two things that cannot use a relative
 * URL: the sitemap and `metadataBase`.
 *
 * It exists because of a bug found by reading the rendered HTML rather than the
 * code: without `metadataBase`, Next resolves `og:image` against
 * `http://localhost:3000` **in a production build**, so every link preview
 * anywhere would have pointed at a machine that is not the internet.
 *
 * Three sources, in order of how much they are trusted:
 *
 *   1. `NEXT_PUBLIC_SITE_URL`, when someone has stated the answer;
 *   2. `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets to the stable
 *      production host — *not* `VERCEL_URL`, which is the per-deployment host
 *      and would put a preview's own hostname in a shared card;
 *   3. the production host as a literal, so a local build produces something
 *      that at least resolves.
 *
 * Never a request header. An origin taken from `Host` is an origin an attacker
 * chooses, and this one ends up inside metadata other people fetch.
 */
export const SITE_ORIGIN: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://vitola.vercel.app')
