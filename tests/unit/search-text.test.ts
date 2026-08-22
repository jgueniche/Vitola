import { describe, expect, it } from 'vitest'

import { foldAccents, toSearchQuery } from '@/lib/search/text'

/**
 * `search_vector` is built from `public.immutable_unaccent(...)`, so a query
 * that folds differently matches nothing — and silently, which is the point of
 * testing it. The pairs below were read out of the live database with
 *
 *   select distinct ch, public.immutable_unaccent(ch) ...
 *
 * over every commercial_name, brand, manufacturer and vitola name, keeping the
 * characters outside printable ASCII. They are the real alphabet of the
 * referential, not a guess at one.
 */
const NON_ASCII_IN_REFERENTIAL: ReadonlyArray<readonly [string, string]> = [
  ['Ñ', 'N'],
  ['á', 'a'],
  ['â', 'a'],
  ['è', 'e'],
  ['é', 'e'],
  ['í', 'i'],
  ['ñ', 'n'],
  ['ó', 'o'],
  ['ö', 'o'],
  ['°', '°'],
]

/**
 * The four where NFD stripping and unaccent() genuinely disagree. Recorded so
 * the divergence stays a known, bounded fact rather than a surprise. It is
 * harmless because tsquery tokenisation drops all of them — also verified
 * against the database.
 */
const DIVERGES_FROM_UNACCENT: ReadonlyArray<readonly [string, string]> = [
  ['«', '<<'],
  ['»', '>>'],
  ['“', '"'],
  ['”', '"'],
]

describe('foldAccents', () => {
  it.each(NON_ASCII_IN_REFERENTIAL)(
    'folds %s exactly as the database does',
    (input, expected) => {
      expect(foldAccents(input)).toBe(expected)
    },
  )

  it.each(DIVERGES_FROM_UNACCENT)(
    'leaves %s alone where unaccent() would expand it',
    (input) => {
      expect(foldAccents(input)).toBe(input)
    },
  )

  it('folds the brand names that motivated all this', () => {
    expect(foldAccents('Cohíba')).toBe('Cohiba')
    expect(foldAccents('Partagás')).toBe('Partagas')
    expect(foldAccents('Por Larrañaga')).toBe('Por Larranaga')
    expect(foldAccents('Ramón Allones')).toBe('Ramon Allones')
    expect(foldAccents('Diplomáticos')).toBe('Diplomaticos')
  })

  it('leaves ASCII untouched', () => {
    expect(foldAccents('Montecristo No. 2')).toBe('Montecristo No. 2')
  })
})

describe('toSearchQuery', () => {
  it('folds and collapses whitespace', () => {
    expect(toSearchQuery('  Cohíba   Behiké  ')).toBe('Cohiba Behike')
  })

  it('keeps the apostrophes and hyphens people actually type', () => {
    // websearch_to_tsquery tolerates these; the plain tsquery parser throws.
    expect(toSearchQuery("Quai d'Orsay")).toBe("Quai d'Orsay")
    expect(toSearchQuery('Petit Edmundo')).toBe('Petit Edmundo')
  })

  it('is empty for whitespace only', () => {
    expect(toSearchQuery('   ')).toBe('')
  })
})
