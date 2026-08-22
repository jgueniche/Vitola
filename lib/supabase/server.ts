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

/** The signed-in user, or null. Never throws: a broken session is not a 500. */
export async function currentUser() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  return error ? null : data.user
}
