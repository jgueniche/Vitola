/**
 * The account's own settings, as rules rather than as queries.
 *
 * Three jsonb-shaped things live in two columns of `profile_settings`, and the
 * database defends them with CHECKs that read the JSON. This file restates the
 * shapes so a form can build a valid object without guessing, and so a value we
 * do not recognise is dropped rather than written back — a preferences blob is
 * the one place where "keep whatever was there" quietly accumulates junk.
 *
 * What is deliberately NOT here: any notion of who may read a profile. One
 * policy decides that (`profiles_select_directory`), and `is_discoverable` is
 * its input, not its implementation.
 */

import type { ScoreScale } from '@/lib/reviews/model'
import type { Database } from '@/lib/supabase/database.types'

export type ConsentKind = Database['public']['Enums']['consent_kind']
export type { ScoreScale }

/* -------------------------------------------------------------------------- */
/* Preferences — profile_settings.preferences                                 */
/* -------------------------------------------------------------------------- */

/*
 * `ScoreScale` is `lib/reviews/model.ts`'s, imported rather than redeclared.
 * The notebook is where a scale means something — it renders scores — and two
 * definitions of the same union is how one of them ends up accepting a value
 * the other refuses.
 */
export const SCORE_SCALES = [100, 20] as const satisfies readonly ScoreScale[]

export const LENGTH_UNITS = ['mm', 'in'] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

export type Preferences = {
  score_scale: ScoreScale
  length_unit: LengthUnit
  email_digest: boolean
}

/** The column default of migration 0001, restated so a form can start from it. */
export const DEFAULT_PREFERENCES: Preferences = {
  score_scale: 100,
  length_unit: 'mm',
  email_digest: false,
}

/**
 * Reads a stored blob into a shape, dropping what we do not recognise.
 *
 * Lenient on the way in and strict on the way out: a row written by an older
 * version of this file, or by hand, must still render a usable form. The
 * alternative — throwing — turns one bad key into a settings page nobody can
 * open, which is the page they would go to in order to fix it.
 */
export function readPreferences(value: unknown): Preferences {
  const raw = isRecord(value) ? value : {}
  const scale = Number(raw.score_scale)

  return {
    score_scale: (SCORE_SCALES as readonly number[]).includes(scale)
      ? (scale as ScoreScale)
      : DEFAULT_PREFERENCES.score_scale,
    length_unit: (LENGTH_UNITS as readonly string[]).includes(String(raw.length_unit))
      ? (raw.length_unit as LengthUnit)
      : DEFAULT_PREFERENCES.length_unit,
    email_digest: raw.email_digest === true,
  }
}

/* -------------------------------------------------------------------------- */
/* Privacy — profile_settings.privacy                                         */
/* -------------------------------------------------------------------------- */

export type Privacy = {
  show_humidor: boolean
  show_reviews: boolean
  show_country: boolean
}

/**
 * The column default of migration 0001.
 *
 * `show_humidor` is false and the other two are true, and that asymmetry is not
 * an accident: what one owns is a different order of disclosure from what one
 * thought. ADR 0006 D4 leans on this default — the humidor's policies are
 * owner-only in v1 precisely because the setting says so before P3 reads it.
 */
export const DEFAULT_PRIVACY: Privacy = {
  show_humidor: false,
  show_reviews: true,
  show_country: true,
}

export function readPrivacy(value: unknown): Privacy {
  const raw = isRecord(value) ? value : {}
  return {
    show_humidor: raw.show_humidor === true,
    show_reviews: raw.show_reviews !== false,
    show_country: raw.show_country !== false,
  }
}

/**
 * Which privacy switches actually govern something a third party can reach
 * **today**, and which are promises to P3.
 *
 * The distinction has to be renderable, for the same reason `SCOPE_TRAITS`
 * exists in the notebook: a switch that changes nothing, offered without saying
 * so, is a setting that lies. `public.follows` and the public profile arrive in
 * P3; until then nobody can read another member's reviews or country whatever
 * these say, and the humidor is owner-only in the policies themselves.
 */
export const PRIVACY_REACHES_NOBODY_YET = true

/* -------------------------------------------------------------------------- */
/* Consents — public.consents                                                  */
/* -------------------------------------------------------------------------- */

export const CONSENT_KINDS = [
  'terms',
  'privacy',
  'age_verification',
  'analytics',
  'marketing_email',
  'health_related_processing',
] as const satisfies readonly ConsentKind[]

/**
 * What each consent covers, and whether it is a *choice*.
 *
 * `optional: false` does not mean "we took it anyway". It means the processing
 * is not based on consent at all — accepting the terms is a contract, and
 * verifying majority before showing tobacco content is a legal obligation
 * (art. 6.1.b and 6.1.c rather than 6.1.a). Showing those as switches would
 * offer a choice that does not exist, and art. 7.4 is explicit that a consent
 * one cannot refuse is not a consent.
 *
 * `active` says whether the processing happens **today**. Every optional one is
 * false, and that is why this page records nothing: there is no analytics, no
 * newsletter, and asking for permission to do something one is not doing
 * manufactures a record rather than a permission. The switch ships with the
 * processing it governs — see the settings page, which says so in French.
 */
export type ConsentTrait = { optional: boolean; active: boolean }

export const CONSENT_TRAITS: Record<ConsentKind, ConsentTrait> = {
  terms: { optional: false, active: true },
  privacy: { optional: false, active: true },
  age_verification: { optional: false, active: true },
  analytics: { optional: true, active: false },
  marketing_email: { optional: true, active: false },
  health_related_processing: { optional: true, active: false },
}

export type ConsentRow = {
  kind: ConsentKind
  granted: boolean
  version: string
  granted_at: string
}

/**
 * The current state of each consent: the most recent row wins.
 *
 * A withdrawal is a new row with `granted = false` — the table has no UPDATE
 * and no DELETE grant, so the history *is* the proof (art. 7.1). Reading the
 * latest is therefore a reduction over the ledger and never a lookup, and this
 * function is the only place that knows it.
 */
export function currentConsents(rows: readonly ConsentRow[]): Map<ConsentKind, ConsentRow> {
  const latest = new Map<ConsentKind, ConsentRow>()

  for (const row of rows) {
    const seen = latest.get(row.kind)
    if (!seen || row.granted_at > seen.granted_at) latest.set(row.kind, row)
  }

  return latest
}

/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
