import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from './database.types'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * The client every Server Component reads through.
 *
 * It carries the publishable key and the caller's session cookies, so RLS
 * governs it exactly as it governs the person at the other end: an anonymous
 * visitor sees published entries, an editor also sees drafts. That is the point
 * — the safety of the referential must never depend on remembering to filter
 * `status` in a query.
 *
 * Async because `cookies()` is. Every call site awaits it.
 */
export async function createSupabaseServerClient() {
  const store = await cookies()

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so the write here is redundant rather
          // than lost — swallowing it is correct, not a shortcut.
        }
      },
    },
  })
}

/**
 * The referential lives in the `ref` schema, not `public`.
 *
 * `ref` had to be added to PostgREST's exposed schemas for this to resolve at
 * all — a project ships exposing only `public` and `graphql_public`. Every
 * referential query goes through this helper so the schema name appears once.
 */
export async function referential() {
  return (await createSupabaseServerClient()).schema('ref')
}

/**
 * What a page needs to know about who is reading: the identity every query
 * is about, and the address the header shows when nothing else names them.
 *
 * Not `User` from supabase-js. That record comes from the auth server, and
 * fetching it was the single most repeated network call of the site (ADR
 * 0021). The two screens that need more than this — the GDPR export, with
 * its dates — ask the auth server themselves, and say why.
 */
export type SessionUser = { id: string; email: string | null }

/**
 * The signed-in user, or null when there is no session.
 *
 * **It throws when it could not find out, and that is the point** (ADR 0020).
 *
 * This used to read `return error ? null : data.user`, under the comment « a
 * broken session is not a 500 ». True of a broken session, false of an outage:
 * on 14 septembre 2026, while the auth API answered 502, a signed-in member
 * opening /carnet, /cave or /fil was REDIRECTED TO THE SIGN-IN PAGE, and on
 * /cigares was served the nine-sheet preview meant for visitors. The site did
 * not say « I could not read »; it said « you are not signed in », which is a
 * statement about the reader, and a false one.
 *
 * 38 pages call this and about ten turn a null into `redirect(signIn())`, so
 * the empty value here is not an empty list — it is an assertion of identity.
 * A failure must be distinguishable from a refusal, and nowhere more than
 * here.
 *
 * **And since 15 septembre 2026 it asks nobody** (ADR 0021). It read
 * `getUser()`, a round trip to the auth server on every page — after the
 * middleware had already made the same call for the same request. Measured:
 * 36 ms at best from Paris, 140 ms from the audit container, on the critical
 * path of every click. `getClaims()` verifies the token's signature locally
 * against the project's public keys, which is the same guarantee the
 * database applies to the same token, and costs nothing on a warm instance.
 *
 * The split is by the shape of the error, not by guesswork:
 *   - no session, an expired or malformed token → 400/401/403, and `null` is
 *     the true answer;
 *   - anything else — a 5xx, a transport failure (the public keys could not be
 *     fetched on a cold instance), a status we do not recognise — is a failure
 *     to ask, and it throws.
 *
 * Erring toward throwing is deliberate: an error screen that says « we could
 * not read » is recoverable by reloading, whereas a wrong « you are signed
 * out » sends someone to type a password they did not need.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (!error) {
    /* No error and no data is how getClaims() says « no session at all ». */
    if (!data) return null
    const { sub, email } = data.claims
    return { id: sub, email: typeof email === 'string' ? email : null }
  }

  /* `AuthApiError` carries the HTTP status; `AuthInvalidJwtError` and
     `AuthSessionMissingError` carry 400; `AuthRetryableFetchError` is the
     transport giving up and carries 0 or none. Only the client-error range
     means « there is no session ». */
  const status = (error as { status?: number }).status
  if (typeof status === 'number' && status >= 400 && status < 500) return null

  throw new Error(`Could not read the session: ${error.message}`)
}
