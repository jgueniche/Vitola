import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  findForbiddenShopTerms,
  isShopTextAllowed,
} from '@/lib/compliance/tobacco-terms'

/**
 * §2 of the brief is blocking, so it is tested, not trusted.
 *
 * Two halves:
 *   1. the shop text guard behaves correctly in both directions;
 *   2. no route, field or label enabling a tobacco transaction exists in the
 *      repository at all.
 */

describe('shop text guard — rejects actual tobacco listings', () => {
  it.each([
    'Cohíba Siglo VI, boîte de 25',
    'Lot de cigarillos',
    'Tabac à pipe premium',
    'Habanos authentiques',
    'Cigarette électronique',
  ])('rejects %s', (text) => {
    expect(isShopTextAllowed(text)).toBe(false)
    expect(findForbiddenShopTerms(text).length).toBeGreaterThan(0)
  })
})

describe('shop text guard — accepts legitimate accessories', () => {
  /*
   * The catalogue is cigar accessories, and their French names contain the
   * word. A guard that rejects these would block the entire shop while letting
   * an actual tobacco listing through. This is the case that matters.
   */
  it.each([
    'Coupe-cigare guillotine double lame',
    'Cave à cigares 50 vitoles, cèdre espagnol',
    'Cendrier à cigares en marbre, deux logements',
    'Étui à cigares en cuir, trois modules',
    'Briquet torche à double flamme',
    'Hygromètre analogique calibrable',
    'Solution d’humidification 70 %',
    'Perce-cigare en acier',
  ])('accepts %s', (text) => {
    expect(findForbiddenShopTerms(text)).toEqual([])
    expect(isShopTextAllowed(text)).toBe(true)
  })
})

describe('shop text guard — normalisation', () => {
  it('is accent and case insensitive', () => {
    expect(isShopTextAllowed('BOÎTE DE 25 HAVANES')).toBe(false)
    expect(isShopTextAllowed('boite de 25 havanes')).toBe(false)
  })

  it('does not fire on a substring inside an unrelated word', () => {
    expect(isShopTextAllowed('Support en bois de purpleheart')).toBe(true)
  })
})

/* ------------------------------------------------------------------------- */

/** Comments explain why a thing is absent; only executable code is asserted on. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}


const SOURCE_DIRS = ['app', 'components', 'lib', 'messages']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.json', '.css']

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc)
    } else if (SOURCE_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      acc.push(full)
    }
  }
  return acc
}

describe('no affordance for selling tobacco exists in the source', () => {
  const files = SOURCE_DIRS.flatMap((dir) => collectSourceFiles(dir))

  /*
   * These are the shapes a tobacco transaction would take if one ever crept in:
   * an affiliate link on a cigar, a vendor field, a stock count, a buy CTA.
   * §5.1 deliberately omits all of them from ref.cigars; this asserts the
   * application layer never reintroduces them.
   */
  it.each([
    'affiliate_url',
    'affiliateUrl',
    'buy_cigar',
    'buyCigar',
    'cigar_price',
    'cigarPrice',
    'add_to_cart_cigar',
    'sell_cigar',
    'trade_cigar',
  ])('does not mention %s anywhere', (needle) => {
    const offenders = files.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes(needle),
    )
    expect(offenders).toEqual([])
  })

  it('never invites the visitor to buy a cigar', () => {
    const invitations = [/acheter\s+(ce\s+)?cigare/i, /commander\s+(ce\s+)?cigare/i]
    const offenders = files.filter((file) => {
      const content = stripComments(readFileSync(file, 'utf8'))
      return invitations.some((pattern) => pattern.test(content))
    })
    expect(offenders).toEqual([])
  })
})


describe('the health notice cannot be dismissed', () => {
  it('exposes no close handler, state or dismissible prop', () => {
    const source = stripComments(
      readFileSync('components/compliance/health-notice.tsx', 'utf8'),
    )
    expect(source).not.toMatch(/dismiss/i)
    expect(source).not.toMatch(/useState/)
    expect(source).not.toMatch(/onClose/)
    expect(source).not.toMatch(/hidden/)
  })

  it('is rendered by the root layout, so it cannot be skipped by a route', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8')
    expect(layout).toContain('<HealthNotice />')
  })
})
