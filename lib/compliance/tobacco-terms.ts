/**
 * Guard against a tobacco product reaching the shop catalogue (§2, §5.8).
 *
 * Single source of truth, applied twice: here for form validation and tests, and
 * by a database trigger on shop.products in P7. An application check alone is
 * bypassed by any direct insert; a database check alone gives the contributor no
 * feedback. The brief asks for both.
 *
 * ---------------------------------------------------------------------------
 * The subtlety that makes a naive blocklist wrong
 * ---------------------------------------------------------------------------
 * The shop's whole catalogue is cigar ACCESSORIES, and their French names
 * contain the word: "coupe-cigare", "cave à cigares", "cendrier à cigares",
 * "étui à cigares". A plain substring check on "cigare" would reject every
 * legitimate product while a listing named "Robusto 2019, boîte de 25" — an
 * actual tobacco product — would sail through untouched.
 *
 * So the order matters: known accessory compounds are removed FIRST, and only
 * what remains is tested. The real barrier is still the closed
 * `shop.products.category` enum, which has no tobacco value at all; this check
 * is the second net, not the first.
 */

/**
 * Accessory compounds that legitimately contain a tobacco word.
 * Matched before the blocklist and removed from the text under test.
 */
export const ALLOWED_ACCESSORY_COMPOUNDS: readonly string[] = [
  'coupe-cigare',
  'coupe cigare',
  'coupe-cigares',
  'coupe cigares',
  'porte-cigare',
  'porte-cigares',
  'etui a cigare',
  'etui a cigares',
  'cave a cigare',
  'cave a cigares',
  'cendrier a cigare',
  'cendrier a cigares',
  'briquet a cigare',
  'briquet a cigares',
  'humidificateur a cigare',
  'humidificateur a cigares',
  'perce-cigare',
  'perce cigare',
  'cigar cutter',
  'cigar case',
  'cigar ashtray',
  'cigar humidor',
]

/**
 * Words that indicate the listing is a tobacco product rather than an accessory.
 * Kept deliberately short: precision matters more than coverage, because the
 * closed category enum is what actually prevents the sale.
 */
export const FORBIDDEN_SHOP_TERMS: readonly string[] = [
  'cigare',
  'cigares',
  'cigarillo',
  'cigarillos',
  'havane',
  'habano',
  'habanos',
  'tabac',
  'tobacco',
  'cigarette',
  'puro',
  'puros',
  'vitole',
  'boite de 25',
  'boite de 10',
]

/** Lowercase, accent-folded, punctuation normalised to spaces. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns the tobacco terms found in a product title or description, after
 * removing legitimate accessory compounds. Empty array means the text is allowed.
 */
export function findForbiddenShopTerms(text: string): string[] {
  let remaining = normalise(text)

  for (const compound of ALLOWED_ACCESSORY_COMPOUNDS) {
    remaining = remaining.split(normalise(compound)).join(' ')
  }

  // Word-boundary matching, so "puro" does not fire on "purort" and
  // "cigare" does not fire inside a compound we failed to list.
  return FORBIDDEN_SHOP_TERMS.filter((term) => {
    const escaped = normalise(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|,|\\.)`).test(remaining)
  })
}

export function isShopTextAllowed(text: string): boolean {
  return findForbiddenShopTerms(text).length === 0
}
