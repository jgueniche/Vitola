/**
 * URL segments are French; identifiers are English (§0.10 of the brief).
 *
 * Every path in the application is built from this map rather than written as a
 * literal, so that the EN/ES localisation of P8 can rewrite segments without
 * touching a single <Link>. This is the whole reason the file exists.
 */
export const SEGMENTS = {
  ageGate: 'majorite',
  signIn: 'connexion',
  cigars: 'cigares',
  brands: 'marques',
  vitolas: 'vitoles',
  boxCodes: 'codes-de-boite',
  contributions: 'contributions',
  tastings: 'degustations',
  humidor: 'cave',
  statistics: 'statistiques',
  scanner: 'scanner',
  feed: 'fil',
  venues: 'lieux',
  journal: 'journal',
  shop: 'boutique',
  settings: 'parametres',
  compare: 'comparer',
  history: 'historique',
  legalNotice: 'mentions-legales',
  privacy: 'confidentialite',
  terms: 'conditions',
  cookies: 'cookies',
  health: 'sante',
  primitives: 'primitives',
} as const

export type SegmentKey = keyof typeof SEGMENTS

export const routes = {
  home: () => '/',
  ageGate: () => `/${SEGMENTS.ageGate}`,
  signIn: () => `/${SEGMENTS.signIn}`,

  cigars: () => `/${SEGMENTS.cigars}`,
  cigar: (slug: string) => `/${SEGMENTS.cigars}/${slug}`,
  cigarHistory: (slug: string) => `/${SEGMENTS.cigars}/${slug}/${SEGMENTS.history}`,
  cigarCompare: () => `/${SEGMENTS.cigars}/${SEGMENTS.compare}`,

  brands: () => `/${SEGMENTS.brands}`,
  brand: (slug: string) => `/${SEGMENTS.brands}/${slug}`,
  vitolas: () => `/${SEGMENTS.vitolas}`,
  vitola: (slug: string) => `/${SEGMENTS.vitolas}/${slug}`,
  boxCodes: () => `/${SEGMENTS.boxCodes}`,

  scanner: () => `/${SEGMENTS.scanner}`,
  humidor: () => `/${SEGMENTS.humidor}`,
  journal: () => `/${SEGMENTS.journal}`,
  venues: () => `/${SEGMENTS.venues}`,
  shop: () => `/${SEGMENTS.shop}`,
  settings: () => `/${SEGMENTS.settings}`,

  legalNotice: () => `/${SEGMENTS.legalNotice}`,
  privacy: () => `/${SEGMENTS.privacy}`,
  terms: () => `/${SEGMENTS.terms}`,
  cookies: () => `/${SEGMENTS.cookies}`,
  health: () => `/${SEGMENTS.health}`,
  primitives: () => `/${SEGMENTS.primitives}`,
} as const

/**
 * Routes reachable WITHOUT clearing the age gate. Everything else is behind it.
 * The middleware reads this list; keeping it here rather than in the middleware
 * makes it testable in isolation.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  routes.ageGate(),
  routes.signIn(),
  routes.legalNotice(),
  routes.privacy(),
  routes.terms(),
  routes.cookies(),
  routes.health(),
]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname)
}

/**
 * Validates the `suite` parameter the age gate carries — where the visitor was
 * going before being interrupted.
 *
 * It arrives in the query string, so it is attacker controlled: an unchecked
 * value turns the gate into an open redirect. Only a same-origin absolute path
 * is honoured, and never one pointing back at a public page, which would bounce
 * the visitor for nothing.
 *
 * Shared by the middleware and the gate's Server Action. It used to exist only
 * in the action; the middleware needed the same rule, and two copies of an
 * open-redirect guard is one too many.
 */
export function safeSuite(suite: string | null | undefined): string | null {
  if (!suite) return null
  if (!suite.startsWith('/') || suite.startsWith('//')) return null

  // Compare the path alone: `/?x=1` is still the public landing page.
  const [path] = suite.split('?')
  if (!path || isPublicPath(path)) return null

  return suite
}
