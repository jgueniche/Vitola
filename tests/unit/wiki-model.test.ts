import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  applyDiff,
  buildDiff,
  EDITABLE_COLUMNS,
  normalise,
  readDiff,
  sameValue,
  staleFields,
  type Diff,
} from '@/lib/wiki/model'

/**
 * The contribution allowlist and the diff arithmetic.
 *
 * The first block is the one that matters, and it is a *security* test wearing
 * ordinary clothes: every column a proposal may write must be a column the
 * UPDATE grant on `ref.cigars` actually allows. A field added to the allowlist
 * without a grant produces a proposal that a reviewer approves and that then
 * silently writes nothing — the worst outcome available, because everybody
 * involved believes it worked.
 *
 * The second block pins the columns kept **out**, with the reason attached.
 */

const SCHEMA = readFileSync(join(process.cwd(), 'docs/phase-0/03-schema-p1.sql'), 'utf8')

/** The column list of `grant update (…) on ref.cigars to authenticated`. */
function grantedColumns(): string[] {
  const match = /grant update \(([\s\S]*?)\) on ref\.cigars to authenticated/.exec(SCHEMA)
  if (!match) return []
  return (match[1] ?? '')
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== '')
}

describe('the allowlist is a subset of what the grant allows', () => {
  const granted = grantedColumns()

  it('actually finds the grant', () => {
    // Guards the guard: an empty list would make the assertion below vacuous.
    expect(granted.length).toBeGreaterThan(10)
    expect(granted).toContain('commercial_name')
  })

  it('proposes no column the database refuses to update', () => {
    const ungranted = EDITABLE_COLUMNS.filter((column) => !granted.includes(column))
    expect(ungranted).toEqual([])
  })
})

describe('what the allowlist deliberately leaves out', () => {
  it('never proposes a slug', () => {
    // Changing it breaks every URL anybody saved, including in their notebook.
    expect(EDITABLE_COLUMNS).not.toContain('slug')
  })

  it('never proposes a price', () => {
    // The price comes from a published decree, not from anybody's memory, and
    // the schema refuses one without a source and a date.
    expect(EDITABLE_COLUMNS).not.toContain('msrp_eur')
    expect(EDITABLE_COLUMNS).not.toContain('msrp_source')
    expect(EDITABLE_COLUMNS).not.toContain('msrp_effective_on')
  })

  it('never proposes an editorial act', () => {
    for (const column of ['status', 'verified_at', 'verified_by', 'merged_into_id', 'created_by']) {
      expect(EDITABLE_COLUMNS).not.toContain(column)
    }
  })

  it('does propose a vitola, which is the referential’s largest hole', () => {
    expect(EDITABLE_COLUMNS).toContain('vitola_id')
  })

  it('does propose a line since ADR 0009, and never a brand', () => {
    // Attaching a sheet to a published line of its own brand is piece 2 of
    // ADR 0009. A sheet that changes brand is a different sheet.
    expect(EDITABLE_COLUMNS).toContain('line_id')
    expect(EDITABLE_COLUMNS).not.toContain('brand_id')
  })
})

describe('normalising a value', () => {
  it('reads every spelling of nothing as null', () => {
    expect(normalise(null)).toBeNull()
    expect(normalise(undefined)).toBeNull()
    expect(normalise('')).toBeNull()
    expect(normalise('   ')).toBeNull()
    expect(normalise([])).toBeNull()
  })

  it('keeps a list a list', () => {
    expect(normalise(['CU', 'NI'])).toEqual(['CU', 'NI'])
    expect(normalise(['CU', ''])).toEqual(['CU'])
  })

  it('compares a missing list and an empty one as equal', () => {
    expect(sameValue(normalise([]), normalise(null))).toBe(true)
    expect(sameValue(normalise(['CU']), normalise(['CU']))).toBe(true)
    expect(sameValue(normalise(['CU', 'NI']), normalise(['NI', 'CU']))).toBe(false)
  })
})

describe('building a diff', () => {
  const current = {
    commercial_name: 'Robusto',
    strength: 'moyen',
    release_year: 2019,
    filler_origins: ['CU'],
    origin_country: null,
  }

  it('holds only what changed', () => {
    const diff = buildDiff(current, { commercial_name: 'Robusto', strength: 'corse' })
    expect(Object.keys(diff)).toEqual(['strength'])
    expect(diff.strength).toEqual({ from: 'moyen', to: 'corse' })
  })

  it('is empty when nothing changed, which is what the constraint refuses', () => {
    expect(buildDiff(current, { commercial_name: 'Robusto' })).toEqual({})
  })

  it('records a field being emptied', () => {
    const diff = buildDiff(current, { release_year: null })
    expect(diff.release_year).toEqual({ from: 2019, to: null })
  })

  it('ignores a column that is not on the allowlist', () => {
    const diff = buildDiff({ ...current, slug: 'robusto' }, { slug: 'autre-chose' } as never)
    expect(diff).toEqual({})
  })
})

describe('staleness', () => {
  const diff: Diff = {
    strength: { from: 'moyen', to: 'corse' },
    release_year: { from: 2019, to: 2020 },
  }

  it('says nothing when the sheet still holds what the proposal saw', () => {
    expect(staleFields(diff, { strength: 'moyen', release_year: 2019 })).toEqual([])
  })

  it('names the field somebody else changed underneath', () => {
    // Approving on top of it would silently revert their change.
    expect(staleFields(diff, { strength: 'leger', release_year: 2019 })).toEqual(['strength'])
  })

  it('ignores columns the proposal does not touch', () => {
    // A busy sheet must stay reviewable.
    expect(staleFields(diff, { strength: 'moyen', release_year: 2019, commercial_name: 'X' })).toEqual(
      [],
    )
  })
})

describe('applying and re-reading a diff', () => {
  it('writes the new values and nothing else', () => {
    expect(applyDiff({ strength: { from: 'moyen', to: 'corse' } })).toEqual({ strength: 'corse' })
  })

  it('drops a column the allowlist no longer names, on the way out too', () => {
    // A row written when the allowlist was wider must not be able to write a
    // column the current code refuses to offer.
    const stored = { slug: { from: 'a', to: 'b' }, strength: { from: 'moyen', to: 'corse' } }
    expect(Object.keys(readDiff(stored))).toEqual(['strength'])
    expect(applyDiff(stored as Diff)).toEqual({ strength: 'corse' })
  })

  it('survives a diff that is not a diff at all', () => {
    expect(readDiff(null)).toEqual({})
    expect(readDiff('texte')).toEqual({})
    expect(readDiff({ strength: 'corse' })).toEqual({})
  })
})
