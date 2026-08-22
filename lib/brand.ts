/**
 * The single source of truth for the commercial name (§1 of the brief).
 *
 * No component, page, e-mail or metadata may hard-code the name. The brief keeps
 * alternatives in reserve (Cepo, Anillo, Cedro, Le Cercle du Cèdre) and the final
 * choice is still open (Q7) — renaming must remain a one-line change.
 *
 * tooling/scripts/check-tokens.ts fails the build if the literal appears anywhere
 * outside this file.
 */
export const BRAND = {
  /** Commercial name, as displayed. */
  name: 'Vitola',
  /** Used where a lowercase machine name is needed (slugs, ids, storage keys). */
  slug: 'vitola',
  /** One line, under 60 characters, for <title> suffixes and OG cards. */
  tagline: 'Le référentiel du cigare',
  /**
   * What the site legally is. Present on every page footer: the site informs,
   * it does not sell (§2).
   */
  disclaimer: "Vitola est un site d'information. Aucun produit du tabac n'y est vendu.",
  locale: 'fr-FR',
  defaultLanguage: 'fr',
  /**
   * The zone the site's "today" is in.
   *
   * A server renders in UTC, so between midnight and 2 a.m. Paris time it would
   * offer yesterday's date as the default for "quand l'avez-vous fumé" — which
   * is exactly when someone finishes a cigar and writes it down. One zone
   * because there is one audience (§0.10); it moves with the locale when P8
   * adds others, and moves from here.
   */
  timeZone: 'Europe/Paris',
} as const

export type Brand = typeof BRAND
