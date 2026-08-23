import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Feature flags, read from `public.feature_flags`.
 *
 * The table is world-readable by policy, so this needs no privilege and no
 * caching layer: it is one indexed row by primary key on a page that is already
 * dynamic.
 *
 * **The fallback is the whole design.** A flag that cannot be read falls back
 * to the value passed in, and that value is chosen per call site so the failure
 * mode is the safe one:
 *
 *   - a flag that *opens* something falls back to **closed**, so a database
 *     hiccup never opens a door;
 *   - a flag that *closes* something would fall back to closed too, which is
 *     why there is no `defaultOpen` convenience: writing `true` has to be a
 *     visible decision at the call site.
 *
 * It also swallows the error, for the reason `reportSlaHours()` gives: the CI
 * build renders these pages against a stand-in Supabase URL where every query
 * throws, and a page that fails to build because a flag was unreachable is a
 * worse outcome than a page that renders in its closed state.
 *
 * Not every flag is read. `show_indicative_prices` is off and **nothing reads
 * it** — the cigar sheet and the comparator both show the price. That is a real
 * inconsistency and it is deliberately not resolved here: wiring it would hide
 * the price on 900 sheets, which is a product decision tied to Q19 and not a
 * side effect of adding a helper.
 */
export async function isFeatureEnabled(key: string, fallback = false): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle()

    return data?.enabled ?? fallback
  } catch {
    return fallback
  }
}
