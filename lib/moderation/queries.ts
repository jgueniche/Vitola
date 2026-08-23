import { DSA_SLA_HOURS } from '@/lib/compliance/dsa'
import type { ModScope } from '@/lib/moderation/model'
import { MOD_LIMITS, reportAge } from '@/lib/moderation/model'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

export type ModReportRow =
  Database['public']['Functions']['mod_queue']['Returns'][number]

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
/**
 * The queue and one case, through the doors of migration 0018.
 *
 * No status predicate lives here and none could: the caller holds no table
 * right in `mod`, and the doors are the whole path. The `scope` argument is a
 * tab filter in the `feed_page()` sense — it says what the list is about,
 * `has_min_role('moderator')` inside the door says who may read at all. A
 * non-moderator gets a thrown 42501, which the screens never trigger because
 * they check the role first to decide what to render — the separation
 * `/contributions` established.
 */
export async function modQueue(scope: ModScope): Promise<ModReportRow[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('mod_queue', {
    p_scope: scope,
    p_limit: MOD_LIMITS.queue,
  })
  if (error) throw new Error(`mod_queue: ${error.message}`)
  return data ?? []
}

/**
 * The open queue with each case's age already computed. The clock is read here
 * and not in the page because a component render must stay pure
 * (`react-hooks/purity`) — data fetching is where "now" belongs.
 */
export async function modQueueWithAge(
  scope: ModScope,
  slaHours: number,
): Promise<Array<ModReportRow & { ageHours: number; overdue: boolean }>> {
  const rows = await modQueue(scope)
  const now = Date.now()
  return rows.map((row) => {
    const age = reportAge(row.created_at, slaHours, now)
    return { ...row, ageHours: age.hours, overdue: age.overdue }
  })
}

export async function modReport(id: string): Promise<ModReportRow | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('mod_report', { p_id: id })
  if (error) throw new Error(`mod_report: ${error.message}`)
  return data?.[0] ?? null
}

/**
 * What the reported thing looks like, read under the CALLER's rights — never
 * through a door (ADR 0013, D3). The moderator SELECT policies each surface
 * already carries decide what comes back; a row RLS withholds renders as
 * "introuvable ou retirée", which is itself information.
 *
 * One query per case screen, switching on the nine reportable surfaces. The
 * `hidden` flag is only meaningful on the four hideable ones; elsewhere it
 * stays false.
 */
export type TargetPreview = {
  /** A short line identifying the thing — a handle, a name, a title. */
  title: string | null
  /** The reported text itself, when the surface has one. */
  excerpt: string | null
  /** Where to see it in situ, when it has an address. */
  href: string | null
  hidden: boolean
}

export async function targetPreview(
  schema: string,
  table: string,
  id: string,
): Promise<TargetPreview | null> {
  const supabase = await createSupabaseServerClient()
  const surface = `${schema}.${table}`

  if (surface === 'public.comments') {
    const { data } = await supabase
      .from('comments')
      .select('body, hidden_at, cigar_id')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    // Hydrated in a second, fixed query — the notebook pattern, never an embed:
    // `ref` is another exposed schema and PostgREST does not join across them.
    const { data: cigar } = await supabase
      .schema('ref')
      .from('cigars')
      .select('slug')
      .eq('id', data.cigar_id)
      .maybeSingle()
    return {
      title: null,
      excerpt: data.body,
      href: cigar ? routes.cigar(cigar.slug) : null,
      hidden: data.hidden_at !== null,
    }
  }

  if (surface === 'public.posts') {
    const { data } = await supabase
      .from('posts')
      .select('body, hidden_at')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return { title: null, excerpt: data.body, href: routes.post(id), hidden: data.hidden_at !== null }
  }

  if (surface === 'public.post_comments') {
    const { data } = await supabase
      .from('post_comments')
      .select('body, hidden_at, post_id')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      title: null,
      excerpt: data.body,
      href: routes.post(data.post_id),
      hidden: data.hidden_at !== null,
    }
  }

  if (surface === 'public.venue_reviews') {
    const { data } = await supabase
      .from('venue_reviews')
      .select('body, hidden_at, venue_id')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const { data: venue } = await supabase
      .from('venues')
      .select('slug, name')
      .eq('id', data.venue_id)
      .maybeSingle()
    return {
      title: venue?.name ?? null,
      excerpt: data.body,
      href: venue ? routes.venue(venue.slug) : null,
      hidden: data.hidden_at !== null,
    }
  }

  if (surface === 'public.reviews') {
    const { data } = await supabase
      .from('reviews')
      .select('body, cigar_id')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    const { data: cigar } = await supabase
      .schema('ref')
      .from('cigars')
      .select('commercial_name')
      .eq('id', data.cigar_id)
      .maybeSingle()
    return {
      title: cigar?.commercial_name ?? null,
      excerpt: data.body,
      href: routes.notebookEntry(id),
      hidden: false,
    }
  }

  if (surface === 'public.profiles') {
    const { data } = await supabase
      .from('profiles')
      .select('handle, display_name, bio')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      title: data.display_name ?? data.handle,
      excerpt: data.bio,
      href: routes.member(data.handle),
      hidden: false,
    }
  }

  if (surface === 'public.messages') {
    const { data } = await supabase.from('messages').select('body').eq('id', id).maybeSingle()
    if (!data) return null
    return { title: null, excerpt: data.body, href: null, hidden: false }
  }

  if (surface === 'public.venues') {
    const { data } = await supabase
      .from('venues')
      .select('name, slug, city')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      title: `${data.name} — ${data.city}`,
      excerpt: null,
      href: routes.venue(data.slug),
      hidden: false,
    }
  }

  if (surface === 'ref.cigars') {
    const { data } = await supabase
      .schema('ref')
      .from('cigars')
      .select('commercial_name, slug')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      title: data.commercial_name,
      excerpt: null,
      href: routes.cigar(data.slug),
      hidden: false,
    }
  }

  return null
}

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
