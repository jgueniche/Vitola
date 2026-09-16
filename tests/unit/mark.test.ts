import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BRAND } from '@/lib/brand'
import {
  INITIAL_PATH,
  INITIAL_PATH_TILE,
  LOCKUP_GAP_RATIO,
  lockupRingSize,
  MARK_VIEWBOX,
  markCut,
  ringStrokeWidth,
  WORDMARK_FONT_SIZE,
} from '@/lib/mark'

/** What a stroke of `units` viewBox units measures, on screen, at size `px`. */
function renderedStroke(px: number, units: number): number {
  return (units * px) / MARK_VIEWBOX
}

describe('three cuts, and what each one is for', () => {
  it('holds exactly 1.5 px across the interface band, and only there', () => {
    for (const size of [28, 34, 42, 48, 64, 80, 95]) {
      expect(renderedStroke(size, ringStrokeWidth(size))).toBeCloseTo(1.5, 5)
    }
  })

  it('meets its neighbours at both crossovers', () => {
    // 1.5 px is the interface band's number, not a promise across the range:
    // the display cut grows with the mark and the tile cut thickens against
    // it. What must hold is that nobody can see where one band ends.
    expect(renderedStroke(96, ringStrokeWidth(96))).toBeCloseTo(1.28, 2)
    expect(renderedStroke(95, ringStrokeWidth(95))).toBeCloseTo(1.5, 5)
    expect(renderedStroke(28, ringStrokeWidth(28))).toBeCloseTo(1.5, 5)
    expect(renderedStroke(27, ringStrokeWidth(27))).toBeCloseTo(1.62, 2)
  })

  it('keeps the tile cut visible down to 16 px', () => {
    expect(renderedStroke(16, ringStrokeWidth(16))).toBeGreaterThan(0.9)
    expect(renderedStroke(24, ringStrokeWidth(24))).toBeCloseTo(1.44, 2)
  })

  it('lands on 1.5 px when the 512 icon is shown at a 32 px tile', () => {
    // app/icon.tsx draws a 410-unit ring inside a 512 tile and asks for the
    // tile cut by name, because a downscaled image is not read at its size.
    const ringAt32 = (410 / 512) * 32
    expect(renderedStroke(ringAt32, ringStrokeWidth(410, 'tile'))).toBeCloseTo(1.54, 2)
  })

  it('picks the cut from the rendered size', () => {
    expect(markCut(512)).toBe('display')
    expect(markCut(96)).toBe('display')
    expect(markCut(95)).toBe('regular')
    expect(markCut(28)).toBe('regular')
    expect(markCut(27)).toBe('tile')
  })
})

describe('the lockup has one ratio', () => {
  it('derives the header ring from the wordmark, not from a typed number', () => {
    expect(lockupRingSize(WORDMARK_FONT_SIZE)).toBe(42)
    // 12.18 px, which is what `gap-3` renders. If this drifts past half a
    // pixel the header should stop using `gap-3`.
    expect(lockupRingSize(WORDMARK_FONT_SIZE) * LOCKUP_GAP_RATIO).toBeCloseTo(12, 0)
  })

  it('reads the same wordmark size as the stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const rule = /\.wordmark\s*\{[^}]*font-size:\s*([\d.]+)rem/.exec(css)
    expect(rule, '`.wordmark` must still declare a font-size in rem').not.toBeNull()
    expect(Number(rule?.[1]) * 16).toBe(WORDMARK_FONT_SIZE)
  })
})

describe('the initial is drawn, and that has a price', () => {
  it('is a V, and the brand still begins with one', () => {
    // The mark is geometry: a rename does not follow it. Q7 is still open, so
    // this assertion is the alarm. If it fails, redraw lib/mark.ts — do not
    // relax the test.
    expect(BRAND.name.charAt(0)).toBe('V')
  })

  it('carries three closed subpaths in both cuts — two serifs and a body', () => {
    for (const path of [INITIAL_PATH, INITIAL_PATH_TILE]) {
      expect(path.startsWith('M')).toBe(true)
      expect(path.match(/Z/g)).toHaveLength(3)
      expect(path).not.toMatch(/NaN|undefined/)
    }
  })
})
