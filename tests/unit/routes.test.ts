import { describe, expect, it } from 'vitest'

import { PUBLIC_PATHS, isApiPath, isPublicPath, routes, SEGMENTS } from '@/lib/routes'

describe('routes', () => {
  it('builds French URL segments from English identifiers', () => {
    expect(routes.cigar('cohiba-siglo-vi')).toBe('/cigares/cohiba-siglo-vi')
    expect(routes.cigarHistory('cohiba-siglo-vi')).toBe('/cigares/cohiba-siglo-vi/historique')
    expect(routes.vitola('lancero')).toBe('/vitoles/lancero')
  })

  it('keeps every segment URL-safe, so the P8 localisation has no escaping to do', () => {
    for (const segment of Object.values(SEGMENTS)) {
      expect(segment).toMatch(/^[a-z0-9-]+$/)
    }
  })

  /*
   * The gate is a routing boundary. If a product route ever appeared in
   * PUBLIC_PATHS it would be reachable by a minor, so the list is asserted
   * exhaustively rather than merely spot-checked.
   */
  it('exposes only non-product routes before the age gate', () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(
      [
        '/',
        '/majorite',
        '/connexion',
        /*
         * Where the magic link lands. Public by necessity: it has to exchange
         * its one-time code for a session before anything else can happen, and
         * a visitor who has not yet cleared the gate would otherwise be
         * redirected away from it and never get a session at all.
         *
         * It renders nothing — it is a Route Handler that sets cookies and
         * redirects — so it exposes no product content. The gate still stands
         * between the session it creates and the referential.
         */
        '/auth/callback',
        '/mentions-legales',
        '/confidentialite',
        '/conditions',
        '/cookies',
        '/sante',
        /*
         * The journal (P6, ADR 0012) — the indexable face of Q13. A `gated`
         * article under it defends itself: its page requires the age-gate
         * cookie and carries noindex, which the walkthrough crosses in both
         * directions.
         */
        '/journal',
        /*
         * The shop (owner's decision, 25 août 2026): accessories only, never
         * tobacco — the closed `shop.products.category` enum and the §2
         * lexical trigger hold that line, not this list. What a minor can
         * reach here is a cutter, a lighter, a hygrometer: objects any street
         * shopfront displays. The tobacco referential stays gated below.
         */
        '/boutique',
      ].sort(),
    )
  })

  it('treats everything under the journal prefix as public (ADR 0012, D3)', () => {
    expect(isPublicPath('/journal/lire-une-bague')).toBe(true)
    // A prefix is not a substring: /journalx is not the journal.
    expect(isPublicPath('/journalx')).toBe(false)
  })

  it('treats everything under the shop prefix as public, checkout included', () => {
    for (const path of [
      routes.shopProduct('coupe-cigare-guillotine'),
      routes.shopVendor('comptoir-du-cedre'),
      routes.shopCart(),
      routes.shopCheckout(),
      routes.shopCheckoutPayment(),
      routes.shopCheckoutDone(),
    ]) {
      expect(isPublicPath(path)).toBe(true)
    }
    // A prefix is not a substring: /boutiquex is not the shop.
    expect(isPublicPath('/boutiquex')).toBe(false)
  })

  it('treats every tobacco route as gated', () => {
    for (const path of [
      routes.cigars(),
      routes.cigar('x'),
      routes.humidor(),
      routes.scanner(),
      routes.venues(),
    ]) {
      expect(isPublicPath(path)).toBe(false)
    }
  })
})

/*
 * The API refusal dialect. The age gate treats these paths exactly as it treats
 * a page — this predicate only decides whether the refusal is a 403 in JSON or
 * a redirect to the gate. It must therefore never claim a path the gate would
 * otherwise let through, and never miss one the GDPR endpoints depend on.
 */
describe('isApiPath', () => {
  it('claims the routes that must refuse in JSON', () => {
    expect(isApiPath('/api/gdpr/export')).toBe(true)
    expect(isApiPath('/api/gdpr/delete')).toBe(true)
  })

  it('claims nothing that renders a page', () => {
    for (const path of [routes.home(), routes.cigars(), routes.ageGate(), routes.primitives()]) {
      expect(isApiPath(path)).toBe(false)
    }
    // Not a prefix match on "/api": a page could legitimately be named so.
    expect(isApiPath('/apiculture')).toBe(false)
  })

  /*
   * The boundary itself, restated: nothing under /api/ is public, so answering
   * in JSON is a change of wording and not of access. If a future /api/ route
   * ever needs to be public it goes through PUBLIC_PATHS, deliberately, and
   * this assertion is what forces that conversation.
   */
  it('leaves the age-gate boundary where it was', () => {
    for (const path of PUBLIC_PATHS) {
      expect(isApiPath(path)).toBe(false)
    }
  })
})
