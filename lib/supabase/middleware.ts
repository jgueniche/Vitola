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

  // getUser(), not getSession(): getSession trusts the cookie as it stands,
  // which is forgeable. getUser() asks the auth server, which is the whole
  // difference between a session and a claim.
  const { data } = await supabase.auth.getUser()

  return { response, user: data.user ?? null }
}

/** Carries refreshed session cookies onto a response the middleware builds itself. */
export function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}
