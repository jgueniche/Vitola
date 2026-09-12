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

import { m } from '@/lib/i18n'

/** Commercial name, as displayed. Written once, here, and nowhere else. */
const NAME = 'Vitola'

export const BRAND = {
  name: NAME,
  /** Used where a lowercase machine name is needed (slugs, ids, storage keys). */
  slug: 'vitola',
  /**
   * One line, under 60 characters, for <title> suffixes and OG cards.
   *
   * It comes from the dictionary because it is visible copy (§0.10), and the
   * English build has its own — a French tagline in an English <title> was the
   * first thing the 12 September build showed.
   */
  tagline: m.brand.tagline,
  /**
   * What the site legally is. Present on every page footer: the site informs,
   * it does not sell (§2).
   *
   * The sentence is a message with a `{brand}` slot rather than a literal: §1
   * keeps the name here and check-tokens refuses it in `messages/`, so the copy
   * and the constant meet at this line and only at this line.
   */
  disclaimer: m.brand.disclaimer.replace('{brand}', NAME),
  /**
   * The FRENCH tags, kept here for what the brand itself is: a French
   * company, a French market, a French legal regime. What `Intl` formats
   * against and what `<html lang>` says are the BUILD's locale, not the
   * brand's — `lib/i18n` owns those (`INTL_LOCALE`, `LANG`), because the
   * English build serves the same brand in another language.
   */
  locale: 'fr-FR',
  defaultLanguage: 'fr',
  /**
   * The zone the site's "today" is in.
   *
   * A server renders in UTC, so between midnight and 2 a.m. Paris time it would
   * offer yesterday's date as the default for "quand l'avez-vous fumé" — which
   * is exactly when someone finishes a cigar and writes it down. One zone
   * because there is one market: the English build of 12 septembre 2026
   * serves the same shop, the same venues and the same price decree, so its
   * "today" is Paris too. It moves from here the day there is a second
   * market, which is not the same thing as a second language.
   */
  timeZone: 'Europe/Paris',
} as const

export type Brand = typeof BRAND
