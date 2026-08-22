import { describe, expect, it } from 'vitest'

import { readCode, readYear, segments } from '@/lib/boxcode/decode'

/**
 * The box-code parser.
 *
 * Everything here is about what the parser refuses to do. It splits a string
 * into letter and digit groups and reads a year; it never decides that three
 * unknown letters are "probably a factory". The seeded factory codes are rated
 * *faible* in `PROVENANCE.md` — Habanos reshuffled them deliberately — and a
 * decoder that guesses with the confidence of a fact is how somebody ends up
 * telling a buyer where their box was rolled.
 */

const TODAY = new Date(Date.UTC(2026, 7, 22))

describe('splitting a code', () => {
  it('reads the same code however it was typed', () => {
    const expected = [
      { kind: 'letters', value: 'OSU' },
      { kind: 'letters', value: 'ABR' },
      { kind: 'digits', value: '19' },
    ]
    expect(segments('OSU ABR 19')).toEqual(expected)
    expect(segments('osu-abr-19')).toEqual(expected)
    expect(segments('  OSU/ABR.19  ')).toEqual(expected)
  })

  it('keeps runs together and in order', () => {
    expect(segments('AB12CD')).toEqual([
      { kind: 'letters', value: 'AB' },
      { kind: 'digits', value: '12' },
      { kind: 'letters', value: 'CD' },
    ])
  })

  it('finds nothing in a string with nothing in it', () => {
    expect(segments('—/—')).toEqual([])
    expect(segments('')).toEqual([])
  })
})

describe('reading a year', () => {
  it('prefers the most recent reading that is not in the future', () => {
    expect(readYear('19', TODAY)?.value).toBe(2019)
    expect(readYear('26', TODAY)?.value).toBe(2026)
  })

  it('falls back a century when this one has not happened yet', () => {
    // 2027 is next year, so `27` is 1927 — which is not a Habanos box code at
    // all, and the interface says the reading is ambiguous rather than certain.
    expect(readYear('27', TODAY)?.value).toBe(1927)
  })

  it('always calls a two-digit year ambiguous', () => {
    // 2019 and 1919 are the same two characters and nothing in the code tells
    // them apart. The parser picks; the page says it picked.
    expect(readYear('19', TODAY)?.ambiguous).toBe(true)
    expect(readYear('85', TODAY)?.ambiguous).toBe(true)
  })

  it('takes four digits at face value, and does not call them ambiguous', () => {
    expect(readYear('1998', TODAY)).toEqual({ value: 1998, century: 1900, ambiguous: false })
    expect(readYear('2098', TODAY)).toBeNull()
    expect(readYear('1800', TODAY)).toBeNull()
  })

  it('refuses anything that is not two or four digits', () => {
    expect(readYear('1', TODAY)).toBeNull()
    expect(readYear('123', TODAY)).toBeNull()
    expect(readYear('', TODAY)).toBeNull()
  })
})

describe('reading a whole code', () => {
  it('separates the letters from the year', () => {
    const reading = readCode('OSU ABR 19', TODAY)
    expect(reading.letters).toEqual(['OSU', 'ABR'])
    expect(reading.year?.value).toBe(2019)
    expect(reading.otherDigits).toEqual([])
    expect(reading.empty).toBe(false)
  })

  it('keeps a second digit group as something other than a year', () => {
    // A batch number. Treating it as a second year would let the page show two
    // production dates for one box.
    const reading = readCode('BM JUN 21 4471', TODAY)
    expect(reading.year?.value).toBe(2021)
    expect(reading.otherDigits).toEqual(['4471'])
  })

  it('reports an input it can make nothing of', () => {
    expect(readCode('///', TODAY).empty).toBe(true)
    expect(readCode('   ', TODAY).empty).toBe(true)
  })

  it('does not invent a meaning for unknown letters', () => {
    // The parser returns the group and says nothing else about it; only the
    // page, holding `ref.box_codes`, may say what it means — and only when the
    // table actually contains it.
    const reading = readCode('ZZZ 19', TODAY)
    expect(reading.letters).toEqual(['ZZZ'])
    expect(Object.keys(reading)).toEqual(['letters', 'year', 'otherDigits', 'empty'])
  })
})
