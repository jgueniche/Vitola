import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  consumesStock,
  csvLine,
  CSV_COLUMNS,
  eventDelta,
  fillRatio,
  HUMIDOR_EVENT_TYPES,
  HUMIDOR_LIMITS,
  maturityStage,
  MATURITY_THRESHOLDS,
  needsRotation,
  OFFERED_EVENT_TYPES,
  parseCsv,
  parseCsvLine,
  ROTATION_DAYS,
} from '@/lib/humidor/model'
import { monthlyBuckets, meanScore, rankCigars } from '@/lib/stats/queries'

/**
 * The humidor's rules, checked against the SQL that defines them.
 *
 * One of these tests matters more than the rest, and it is the first: `lib`
 * duplicates the *sign* of an event, which no other bound in this repository
 * does. The reason is in the module — a member has to read "il vous en restera
 * 4" before confirming, not after a round trip — and a duplicated sign that
 * drifts would show a stock that the database then contradicts, silently, in
 * the direction nobody checks.
 *
 * `move` is the one worth pinning hardest. It is deliberately zero on both
 * sides: a lot changing humidor changes no count. Anyone "fixing" it to -qty in
 * SQL would empty every moved lot, and the only thing standing there is this
 * assertion.
 */

const M0008 = readFileSync(join(process.cwd(), 'supabase/migrations/0008_cave.sql'), 'utf8')

/** The `case` arms of public.humidor_event_delta(), read out of the migration. */
function sqlDeltas(): Record<string, string> {
  const body = /when 'add'[\s\S]*?when 'move'\s+then\s+0/.exec(M0008)?.[0] ?? ''
  const arms: Record<string, string> = {}
  for (const match of body.matchAll(/when '(\w+)'\s+then\s+(-?\s*p_qty|0)/g)) {
    const type = match[1]
    const expression = match[2]
    if (type && expression) arms[type] = expression.replace(/\s+/g, '')
  }
  return arms
}

describe('the event signs mirror migration 0008', () => {
  const arms = sqlDeltas()

  it('reads every arm of humidor_event_delta out of the SQL', () => {
    // Guards the guard: a regex that stops matching would make every assertion
    // below pass over an empty object. T8's lesson, in a TypeScript file.
    expect(Object.keys(arms).sort()).toEqual([...HUMIDOR_EVENT_TYPES].sort())
  })

  it.each([...HUMIDOR_EVENT_TYPES])('agrees with SQL on %s', (type) => {
    const expected = arms[type] === '0' ? 0 : arms[type] === 'p_qty' ? 7 : -7
    expect(eventDelta(type, 7)).toBe(expected)
  })

  it('keeps move at zero on both sides', () => {
    expect(arms.move).toBe('0')
    expect(eventDelta('move', 25)).toBe(0)
  })

  it('knows which types need stock to exist', () => {
    expect(consumesStock('smoke')).toBe(true)
    expect(consumesStock('gift')).toBe(true)
    expect(consumesStock('loss')).toBe(true)
    expect(consumesStock('add')).toBe(false)
    expect(consumesStock('move')).toBe(false)
  })

  it('offers neither add nor move as a gesture', () => {
    // Both are written by triggers. A button for either would be a second way
    // to disagree with the ledger.
    expect(OFFERED_EVENT_TYPES).not.toContain('add')
    expect(OFFERED_EVENT_TYPES).not.toContain('move')
  })
})

describe('the bounds mirror migration 0008', () => {
  it('caps the name where humidors_name_len does', () => {
    const match = /humidors_name_len\s+check \(length\(btrim\(name\)\) between 1 and (\d+)\)/.exec(
      M0008,
    )
    expect(match, 'humidors_name_len is no longer in migration 0008').not.toBeNull()
    expect(Number(match?.[1])).toBe(HUMIDOR_LIMITS.nameMax)
  })

  it('bounds the capacity where humidors_capacity does', () => {
    const match = /capacity between (\d+) and (\d+)/.exec(M0008)
    expect(Number(match?.[1])).toBe(HUMIDOR_LIMITS.capacityMin)
    expect(Number(match?.[2])).toBe(HUMIDOR_LIMITS.capacityMax)
  })

  it('bounds the price where humidor_items_price does', () => {
    const match = /purchase_price_eur between (\d+) and (\d+)/.exec(M0008)
    expect(Number(match?.[1])).toBe(HUMIDOR_LIMITS.priceMin)
    expect(Number(match?.[2])).toBe(HUMIDOR_LIMITS.priceMax)
  })

  it('caps the notes where humidor_items_notes_len does', () => {
    const match = /humidor_items_notes_len\s+check \(notes\s+is null or length\(notes\)\s+<= (\d+)\)/.exec(
      M0008,
    )
    expect(Number(match?.[1])).toBe(HUMIDOR_LIMITS.notesMax)
  })

  it('keeps the event quantity inside what humidor_events_qty_bounds takes', () => {
    const match = /humidor_events_qty_bounds check \(qty between (-?\d+) and (\d+)\)/.exec(M0008)
    expect(Number(match?.[2])).toBe(HUMIDOR_LIMITS.qtyMax)
  })
})

describe('the derived readings', () => {
  it('has no maturity for a lot with no date', () => {
    expect(maturityStage(null)).toBeNull()
  })

  it('walks the four stages at their thresholds', () => {
    expect(maturityStage(0)).toBe('fresh')
    expect(maturityStage(MATURITY_THRESHOLDS.settling - 1)).toBe('fresh')
    expect(maturityStage(MATURITY_THRESHOLDS.settling)).toBe('settling')
    expect(maturityStage(MATURITY_THRESHOLDS.ready)).toBe('ready')
    expect(maturityStage(MATURITY_THRESHOLDS.mature)).toBe('mature')
  })

  it('flags a forgotten lot, and only a forgotten one', () => {
    expect(needsRotation(ROTATION_DAYS, null)).toBe(true)
    expect(needsRotation(ROTATION_DAYS - 1, null)).toBe(false)
    // Smoked once, so it is being drawn from rather than forgotten.
    expect(needsRotation(ROTATION_DAYS + 400, '2026-01-01')).toBe(false)
    expect(needsRotation(null, null)).toBe(false)
  })

  it('has no fill ratio without a declared capacity', () => {
    expect(fillRatio(12, null)).toBeNull()
    expect(fillRatio(12, 0)).toBeNull()
    expect(fillRatio(12, 24)).toBe(0.5)
  })
})

describe('the CSV interchange', () => {
  it('quotes only what needs quoting, and doubles the quote', () => {
    expect(csvLine(['plain', 1, null])).toBe('plain,1,')
    expect(csvLine(['a,b'])).toBe('"a,b"')
    expect(csvLine(['say "hi"'])).toBe('"say ""hi"""')
  })

  it('reads back what it wrote', () => {
    const written = csvLine(['boîte de 25, entamée', 'say "hi"', 'plain'])
    expect(parseCsvLine(written)).toEqual(['boîte de 25, entamée', 'say "hi"', 'plain'])
  })

  it('refuses a file without the two columns it needs', () => {
    expect(parseCsv('name,qty\nfoo,1').error).toBe('header')
    expect(parseCsv('').error).toBe('empty')
    expect(parseCsv('cigar_slug,qty').rows).toEqual([])
  })

  it('keys rows by header name, so a reordered file still imports', () => {
    const { rows } = parseCsv('qty,cigar_slug\n3,undercrown-10-robusto')
    expect(rows).toEqual([{ qty: '3', cigar_slug: 'undercrown-10-robusto' }])
  })

  it('names the cigar by slug and never by id', () => {
    // A uuid is meaningless outside this database; an export carrying one is a
    // file one can read back here and nowhere else.
    expect(CSV_COLUMNS).toContain('cigar_slug')
    expect(CSV_COLUMNS.join(',')).not.toContain('cigar_id')
  })
})

describe('the statistics shaping', () => {
  const anchor = new Date(Date.UTC(2026, 7, 22))

  it('draws twelve months, including the empty ones', () => {
    const buckets = monthlyBuckets(['2026-08-01', '2026-08-14', '2026-06-02'], anchor)
    expect(buckets).toHaveLength(12)
    expect(buckets.at(-1)).toEqual({ month: '2026-08', count: 2 })
    expect(buckets.find((b) => b.month === '2026-07')).toEqual({ month: '2026-07', count: 0 })
    expect(buckets[0]?.month).toBe('2025-09')
  })

  it('ignores anything outside the window without shifting the buckets', () => {
    const buckets = monthlyBuckets(['2019-01-01'], anchor)
    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true)
  })

  it('averages only the entries that carry a score', () => {
    expect(meanScore([80, null, 90])).toBe(85)
    expect(meanScore([null, null])).toBeNull()
    expect(meanScore([])).toBeNull()
  })

  it('drops the cigars smoked once, because one is not a habit', () => {
    const ranked = rankCigars(['a', 'a', 'b', 'c', 'c', 'c'])
    expect(ranked).toEqual([
      { cigarId: 'c', count: 3 },
      { cigarId: 'a', count: 2 },
    ])
  })
})
