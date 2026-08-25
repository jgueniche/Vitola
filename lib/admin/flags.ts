/**
 * What the flags screen knows about each flag, beyond what the table holds.
 *
 * The table is the truth for existence and state — the screen lists what the
 * database returns, so a flag added by a future migration appears without
 * anybody editing this file, with its stored English description as fallback.
 * What this file adds is what a screen cannot infer: the French copy key, the
 * shape of an editable payload, and whether flipping the flag changes a
 * published commitment.
 *
 * ADR 0014, D2: the screen edits a payload only where a shape is declared
 * here. Free-form JSON at the screen would let an admin break what a page
 * reads (`venues_enabled.types`, `comments_min_role.min_role`).
 */

import { Constants } from '@/lib/supabase/database.types'

export const KNOWN_FLAGS = [
  'public_signup_open',
  'show_indicative_prices',
  'wiki_contributions_open',
  'comments_min_role',
  'dsa_report_sla_hours',
  'venues_enabled',
] as const

export type KnownFlag = (typeof KNOWN_FLAGS)[number]

export function isKnownFlag(key: string): key is KnownFlag {
  return (KNOWN_FLAGS as readonly string[]).includes(key)
}

/** The one payload field a flag exposes to the screen, when it exposes one. */
export type PayloadField =
  | { key: 'hours'; kind: 'hours'; min: number; max: number }
  | { key: 'min_role'; kind: 'role'; roles: readonly string[] }

export const PAYLOAD_FIELDS: Partial<Record<KnownFlag, PayloadField>> = {
  /* The published deadline. Bounds are sanity, not law: below an hour the
     promise is not keepable by a human, beyond 30 days it is not a promise. */
  dsa_report_sla_hours: { key: 'hours', kind: 'hours', min: 1, max: 720 },
  /* Who may comment. `admin` is excluded on purpose: a floor that high would
     turn the feature off while reading as a permission setting. */
  comments_min_role: {
    key: 'min_role',
    kind: 'role',
    roles: Constants.public.Enums.app_role.filter((role) => role !== 'admin'),
  },
}

/**
 * Flags whose change alters something promised outside the product — the
 * screen must say so before the gesture, not after.
 */
export const COMMITMENT_FLAGS: readonly KnownFlag[] = [
  'dsa_report_sla_hours',
  'public_signup_open',
]
