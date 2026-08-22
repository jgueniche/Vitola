import { describe, expect, it } from 'vitest'

import { PUBLIC_PATHS, isPublicPath, routes, SEGMENTS } from '@/lib/routes'

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
        '/mentions-legales',
        '/confidentialite',
        '/conditions',
        '/cookies',
        '/sante',
      ].sort(),
    )
  })

  it('treats every product route as gated', () => {
    for (const path of [
      routes.cigars(),
      routes.cigar('x'),
      routes.humidor(),
      routes.scanner(),
      routes.shop(),
      routes.venues(),
      routes.journal(),
    ]) {
      expect(isPublicPath(path)).toBe(false)
    }
  })
})
