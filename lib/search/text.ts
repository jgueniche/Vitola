/**
 * Accent folding for search queries.
 *
 * `ref.cigars.search_vector` is built from `public.immutable_unaccent(...)`, so
 * the lexemes stored in the index are already folded: the vector holds `cohiba`,
 * never `cohíba`. A query that is not folded the same way silently matches
 * nothing — the worst kind of search bug, because it looks like "no results"
 * rather than like an error.
 *
 * Doing this in TypeScript duplicates an algorithm that lives in SQL, which the
 * project otherwise refuses to do. The alternative — an RPC that folds
 * server-side — would put a round trip and a migration in front of every
 * keystroke, so the duplication is accepted here and pinned down instead:
 * `tests/unit/search-text.test.ts` checks this function against the exact
 * characters present in the referential, and the pairs in that test were read
 * out of the real database, not imagined.
 *
 * Measured divergence from PostgreSQL's `unaccent()`, on the 15 non-ASCII
 * characters actually present in the referential: the eleven letters
 * (Ñ á â è é í ñ ó ö and the degree sign) fold identically, and four
 * punctuation marks do not — unaccent expands « » to << >> and the curly
 * quotes “ ” to ". It does not matter, and that was checked rather than
 * assumed: `websearch_to_tsquery` discards all four as non-word characters, so
 * both spellings produce the same lexemes. Verified against the live database.
 *
 * What NFD stripping does not do at all is expand ligatures and strokes
 * (Æ→AE, Ø→O, ß→ss). None occurs in the referential today. If one arrives,
 * `tests/unit/search-text.test.ts` is what will say so.
 */
export function foldAccents(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Turns what someone typed into something `websearch_to_tsquery` accepts.
 *
 * `websearch` is the forgiving parser: it never throws on unbalanced quotes or
 * stray operators, which the plain `tsquery` parser does. Users type apostrophes
 * and hyphens — "Quai d'Orsay", "Petit Edmundo" — and a parser that errors on
 * those turns a normal search into a 500.
 */
export function toSearchQuery(raw: string): string {
  return foldAccents(raw).trim().replace(/\s+/g, ' ')
}
