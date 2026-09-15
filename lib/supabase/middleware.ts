import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from './database.types'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * Refreshes the Supabase session on every request.
 *
 * A session token expires. Only the middleware can write the refreshed cookie
 * back — a Server Component cannot set cookies — so if this does not run, a
 * signed-in member is silently signed out an hour later. That is the same class
 * of bug as the age gate asking twice, and it is avoided in the same place.
 *
 * The returned response carries any refreshed cookies. A caller that redirects
 * instead must copy them across, or the refresh is discarded.
 */
export async function refreshSession(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  /*
   * getClaims(), not getUser() — and not getSession() either (ADR 0021).
   *
   * getSession() trusts the cookie as it stands, which is forgeable. getUser()
   * asks the auth server, and that is one network round trip on EVERY request
   * the matcher lets through: pages, RSC navigations, and the 19 to 41
   * prefetches a list page fires as its links scroll into view. Measured on
   * 15 septembre 2026: 30 to 120 ms from the edge per call, and four auth
   * lookups for every PostgREST query in the database's own statistics.
   *
   * getClaims() verifies the token's signature locally, against the project's
   * public signing keys (ES256; fetched once, cached ten minutes per instance).
   * A forged cookie still fails. What it does not see is a revocation inside
   * the token's remaining lifetime — an hour at most — and that is exactly the
   * trust the database already extends to the same token: PostgREST checks the
   * signature and nothing else. The middleware is not a stricter door than the
   * data behind it.
   *
   * The refresh is unchanged: an expired session is renewed on the same path
   * getUser() used, and the new cookies ride on `response`.
   */
  await supabase.auth.getClaims()

  return { response }
}

/** Carries refreshed session cookies onto a response the middleware builds itself. */
export function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}
