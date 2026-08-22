import { DSA_SLA_HOURS } from '@/lib/compliance/dsa'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The announced processing deadline, in hours.
 *
 * Read from `feature_flags.dsa_report_sla_hours` rather than from the constant,
 * because the flag is what the migration calls the place where a commitment
 * lives: "il engage, donc il se déclare ici et pas dans un gabarit". Changing
 * what we promise must not need a deploy.
 *
 * Falls back to the pinned constant, and swallows the error to do it. That is
 * the unusual part and it is deliberate: this number appears in the legal
 * notice, and a legal page that fails to render because a flag could not be
 * read is a page that has quietly stopped making its commitment. The two values
 * cannot drift — `tests/compliance/dsa.test.ts` reads migration 0004 and fails
 * if they do.
 *
 * The read is also what lets the page render during a CI build, where the
 * Supabase URL is a stand-in and every query throws.
 */
export async function reportSlaHours(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled, payload')
      .eq('key', 'dsa_report_sla_hours')
      .maybeSingle()

    if (!data?.enabled) return DSA_SLA_HOURS

    const payload = data.payload as { hours?: unknown } | null
    const hours = payload?.hours
    return typeof hours === 'number' && Number.isFinite(hours) && hours > 0
      ? hours
      : DSA_SLA_HOURS
  } catch {
    return DSA_SLA_HOURS
  }
}
