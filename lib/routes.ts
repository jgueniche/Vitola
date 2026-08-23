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
  aromas: 'aromes',
  contributions: 'contributions',
  /* The notebook of ADR 0004 — one table, one section, two gestures. The P0
     arborescence called this section `degustations/`, which was written before
     that ADR merged the daily note and the structured exercise into a single
     `reviews` row; `carnet` is what the product calls it, and the URL follows
     the product rather than the older plan. `tasting` below is the exercise
     performed on one cigar; `tastings` stays the plural listing that the P3
     public profile will need. */
  notebook: 'carnet',
  tasting: 'degustation',
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
  /* Not a French segment: nobody types it and no localisation rewrites it.
     Supabase redirects here with the one-time code from the magic link. */
  authCallback: () => '/auth/callback',

  cigars: () => `/${SEGMENTS.cigars}`,
  cigar: (slug: string) => `/${SEGMENTS.cigars}/${slug}`,
  cigarHistory: (slug: string) => `/${SEGMENTS.cigars}/${slug}/${SEGMENTS.history}`,
  /* Proposer une correction pend sous la fiche qu'elle corrige : c'est de là
     qu'on part, en ayant sous les yeux ce qu'on veut changer. La file, elle,
     est un lieu à part — on y va pour relire, pas pour lire une fiche. */
  cigarPropose: (slug: string) => `/${SEGMENTS.cigars}/${slug}/proposer`,
  contributions: () => `/${SEGMENTS.contributions}`,
  cigarCompare: () => `/${SEGMENTS.cigars}/${SEGMENTS.compare}`,
  /* The structured tasting hangs off the cigar it is about, because that is
     where one starts it: the entry is already open, and the form needs nothing
     the page has not already read. The notebook below is where it is reread. */
  cigarTasting: (slug: string) => `/${SEGMENTS.cigars}/${slug}/${SEGMENTS.tasting}`,

  notebook: () => `/${SEGMENTS.notebook}`,
  notebookEntry: (id: string) => `/${SEGMENTS.notebook}/${id}`,

  brands: () => `/${SEGMENTS.brands}`,
  brand: (slug: string) => `/${SEGMENTS.brands}/${slug}`,
  vitolas: () => `/${SEGMENTS.vitolas}`,
  vitola: (slug: string) => `/${SEGMENTS.vitolas}/${slug}`,
  boxCodes: () => `/${SEGMENTS.boxCodes}`,
  aromas: () => `/${SEGMENTS.aromas}`,

  scanner: () => `/${SEGMENTS.scanner}`,
  humidor: () => `/${SEGMENTS.humidor}`,
  /* One cave per page rather than an accordion on `/cave`: the inventory, the
     ledger and the hygrometry of a single humidor are already a page, and the
     multi-cave case of §5.5 would otherwise nest three lists inside a fourth. */
  humidorDetail: (id: string) => `/${SEGMENTS.humidor}/${id}`,
  humidorExport: () => `/${SEGMENTS.humidor}/export`,
  statistics: () => `/${SEGMENTS.statistics}`,
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
  routes.authCallback(),
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
 * Routes that answer in JSON, including when they refuse.
 *
 * These are gated exactly like a page — the age-gate boundary does not move for
 * them, and nothing here makes anything reachable that was not. What changes is
 * the dialect of the refusal: a caller of `/api/` cannot read a 307 to an HTML
 * date-of-birth form, and the GDPR endpoints of §2 are the case that makes it
 * matter. A legal right answered with a redirect is a right not answered.
 */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
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
