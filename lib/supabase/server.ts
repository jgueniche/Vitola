import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * The client every Server Component reads the referential through.
 *
 * It carries the publishable key, so it is governed by RLS exactly like a
 * browser would be: drafts stay invisible, and no page can accidentally read
 * more than a visitor is allowed to. That is the point — the safety of the
 * referential must not depend on remembering to filter `status` in a query.
 *
 * Session persistence is switched off explicitly. supabase-js defaults to
 * storing a session, which on a server is both useless and a cross-request
 * leak waiting to happen: one visitor's token must never be reachable from
 * another's render.
 *
 * A new client per call, not a module singleton. It costs nothing measurable,
 * and it is what lets authentication land later (P1, `connexion/`) by attaching
 * the caller's token here rather than reworking every page.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * The referential lives in the `ref` schema, not `public`.
 *
 * `ref` had to be added to PostgREST's exposed schemas for this to resolve at
 * all — it ships exposing only `public` and `graphql_public`. Every referential
 * query goes through this helper so that the schema name appears once.
 */
export function referential() {
  return createSupabaseServerClient().schema('ref')
}
