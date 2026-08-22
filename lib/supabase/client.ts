'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * The browser client. Exists for one job: letting a client component react to
 * a sign-in or sign-out without a full page load.
 *
 * Everything that reads data still does so on the server — see server.ts. This
 * client carries the publishable key, so RLS governs it exactly as it governs
 * an anonymous visitor plus whatever the session grants.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey())
}
