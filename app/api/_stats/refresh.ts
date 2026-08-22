import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * The write-time half of `cigar_stats`, which migration 0006 §3 describes and
 * leaves to "le carnet, qui est ce qui écrit".
 *
 * Why this file sits under `app/api/` while nothing here answers a request.
 * `refresh_cigar_stats()` is granted to `service_role` and to nobody else — the
 * refresh reads every public review, which no client role may do — so calling
 * it means importing the service-role client, and ESLint allows that import
 * from `app/api/**` alone. The rule was widened to `app/**\/*.ts` precisely to
 * stop a Server Action reaching for that key, so the honest way to satisfy both
 * is to put the call where the key is already allowed rather than to carve a
 * new hole in the guard. `_stats` is a Next private folder: it is excluded from
 * routing, so this is a module and never an endpoint.
 *
 * Granting the function to `authenticated` instead would have avoided the
 * detour and been much worse: `REFRESH MATERIALIZED VIEW` is whole-view work,
 * and a member who may call it at will may keep the database busy at will.
 *
 * The scheduled refresh of 0006 stays. The two do not overlap:
 *   - this one serves *the person* who just published, so their note counts on
 *     the entry they are looking at rather than in up to five minutes;
 *   - pg_cron serves *the data*, and catches what no write can — the 90-day
 *     window of `review_count_90d` goes stale on its own, with nobody writing.
 */

/**
 * Refreshes the public rating aggregate. Never throws.
 *
 * Swallowing the failure is deliberate and is the only judgement in this file.
 * The refresh is a courtesy — it buys the author freshness the cron job would
 * have delivered within five minutes anyway. Letting it fail the Server Action
 * would tell someone their entry was not saved when it was, and would leave
 * them re-submitting a note that is already in the database. The write is the
 * commitment; this is the polish on it.
 *
 * `console.error` rather than silence: an invisible failure that repeats is how
 * a stale average becomes a mystery. It is the one channel a Server Action has.
 */
export async function refreshCigarStats(): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const { error } = await admin.rpc('refresh_cigar_stats')
    if (error) {
      console.error('[carnet] refresh_cigar_stats failed:', error.message)
    }
  } catch (cause) {
    console.error('[carnet] refresh_cigar_stats could not be called:', cause)
  }
}
