import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import { supabaseUrl } from './env'

/**
 * The service_role client. It bypasses RLS entirely (§8).
 *
 * An ESLint rule refuses this import anywhere but `app/api/**` and
 * `supabase/functions/**` — see eslint.config.mjs. The rule is the real barrier;
 * this comment only explains it. Nothing here may ever be reachable from a
 * client bundle: the key it carries can read every draft, every birth date and
 * every consent record in the database.
 *
 * Deliberately NOT prefixed NEXT_PUBLIC_. A `NEXT_PUBLIC_` variable is inlined
 * into the browser bundle by Next, which for this key would publish it.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is missing. Server-only, never NEXT_PUBLIC_ — see .env.example.',
    )
  }

  return createClient<Database>(supabaseUrl(), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
