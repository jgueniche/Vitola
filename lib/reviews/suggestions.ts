import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Five bands to try, and the moment each one asks for.
 *
 * The ranking is `public.suggest_cigars()` (migration 0032) and not a line of
 * it is here: it reads the caller's notebook under the four SELECT policies of
 * ADR 0004, so recomputing any of it in TypeScript would be a second copy of a
 * rule that must have one. What this file adds is the half the database has no
 * business deciding — how to say why.
 */

export type SuggestionReason = 'aroma' | 'profile' | 'popular'

export type Suggestion = {
  cigar_id: string
  slug: string
  commercial_name: string
  brand_name: string | null
  vitola_name: string | null
  ring_gauge: number | null
  length_mm: number | null
  strength: string | null
  wrapper_shade: string | null
  aroma_tags: number[]
  shared_aromas: number
  score: number
  reason: SuggestionReason
}

function readReason(value: unknown): SuggestionReason {
  return value === 'aroma' || value === 'profile' ? value : 'popular'
}

export async function readSuggestions(limit = 5): Promise<Suggestion[]> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('suggest_cigars', { p_limit: limit })
  /* A suggestion is an invitation, never a page that refuses to render. A
     member whose notebook cannot be read — a session that expired between the
     header and here — gets an empty list and the empty state's sentence. */
  if (error) return []

  return (data ?? []).map((row) => ({
    cigar_id: row.cigar_id ?? '',
    slug: row.slug ?? '',
    commercial_name: row.commercial_name ?? '',
    brand_name: row.brand_name,
    vitola_name: row.vitola_name,
    ring_gauge: row.ring_gauge,
    length_mm: row.length_mm,
    strength: row.strength,
    wrapper_shade: row.wrapper_shade,
    aroma_tags: row.aroma_tags ?? [],
    shared_aromas: row.shared_aromas ?? 0,
    score: Number(row.score ?? 0),
    reason: readReason(row.reason),
  }))
}

/* -------------------------------------------------------------------------- */
/* L'ambiance                                                                 */
/* -------------------------------------------------------------------------- */

export type Ambiance = 'court' | 'moyen' | 'long'

/**
 * The moment a format asks for, derived from its dimensions and from nothing
 * else.
 *
 * « Il fait des propositions, avec ce qu'il a pas fumé, l'ambiance etc. » —
 * and the honest way to say an ambiance is to read it off the object. A
 * petit corona is twenty minutes with a coffee; a double corona is an evening.
 * That is not a taste, it is the burn: length is how far the ember has to
 * travel and the ring gauge is how much leaf it eats on the way.
 *
 * **Three bands and not a figure in minutes.** A burn time depends on the
 * draw, the humidity and the smoker, and none of those is in the database.
 * Printing « 47 min » would be invented precision of exactly the kind the §5.1
 * scale exists to refuse — and the seed rules already refuse it for strength.
 * Three bands are what the dimensions actually support.
 *
 * The thresholds: under 130 mm OR under a 40 ring is a short smoke (a
 * panetela, a petit corona); up to 155 mm is the middle where most robustos
 * and coronas sit; beyond that, or a 52 ring and up, is the long end.
 *
 * Returns null when the sheet has no vitola — 601 of 940 do not. A suggestion
 * says nothing about the moment rather than guessing at one.
 */
export function ambianceOf(lengthMm: number | null, ringGauge: number | null): Ambiance | null {
  if (lengthMm === null && ringGauge === null) return null

  if ((lengthMm !== null && lengthMm < 130) || (ringGauge !== null && ringGauge < 40)) {
    return 'court'
  }
  if (lengthMm !== null && lengthMm > 155) return 'long'
  if (ringGauge !== null && ringGauge >= 52 && lengthMm === null) return 'long'
  return 'moyen'
}
