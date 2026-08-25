import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALLOWED_ACCESSORY_COMPOUNDS,
  FORBIDDEN_SHOP_TERMS,
} from '@/lib/compliance/tobacco-terms'

/**
 * The one duplicated LOGIC of the shop (ADR 0015, D2): the tobacco lexicon
 * lives in TypeScript for the screen's French refusal, and in SQL for the
 * trigger no direct write can bypass. A drifted pair is worse than either
 * alone — the screen would accept what the base refuses, or the base accept
 * what the screen refuses, and both read as "it worked" to somebody.
 *
 * Both directions are asserted: a term added to one list must be added to the
 * other, and the extraction guards itself — an empty parse would make every
 * assertion vacuous (the T8 lesson).
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/0021_shop_catalogue.sql'),
  'utf8',
)

function sqlArray(name: string): string[] {
  const match = new RegExp(`${name} constant text\\[\\] := array\\[([\\s\\S]*?)\\];`).exec(
    MIGRATION,
  )
  if (!match) return []
  return [...(match[1] ?? '').matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    (m[1] ?? '').replaceAll("''", "'"),
  )
}

describe('the SQL lexicon and the TypeScript lexicon are the same lexicon', () => {
  const sqlCompounds = sqlArray('compounds')
  const sqlForbidden = sqlArray('forbidden')

  it('actually finds both arrays in the migration', () => {
    // Guards the guard: an empty parse would make the comparisons vacuous.
    expect(sqlCompounds.length).toBeGreaterThan(10)
    expect(sqlForbidden.length).toBeGreaterThan(10)
  })

  it('agrees on the accessory compounds, both directions', () => {
    expect([...sqlCompounds].sort()).toEqual([...ALLOWED_ACCESSORY_COMPOUNDS].sort())
  })

  it('agrees on the forbidden terms, both directions', () => {
    expect([...sqlForbidden].sort()).toEqual([...FORBIDDEN_SHOP_TERMS].sort())
  })

  it('keeps the compounds normalised, because SQL strips accents before matching', () => {
    // The trigger lowercases and unaccents the TEXT under test; a compound
    // stored with an accent or a capital would then never match anything.
    for (const compound of sqlCompounds) {
      expect(compound, compound).toBe(
        compound
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase(),
      )
    }
  })
})
