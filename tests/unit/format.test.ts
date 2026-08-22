import { describe, expect, it } from 'vitest'

import { formatDimensions, formatScore, millimetresToInches } from '@/lib/format'

describe('formatDimensions', () => {
  it('writes cepo × length the way a box does', () => {
    expect(formatDimensions(52, 150)).toBe('52 × 150 mm')
  })
})

describe('millimetresToInches', () => {
  it('converts to one decimal, the trade norm', () => {
    expect(millimetresToInches(124)).toBe(4.9)
    expect(millimetresToInches(192)).toBe(7.6)
  })
})

describe('formatScore', () => {
  it('renders a score on 100 by default', () => {
    expect(formatScore(91)).toBe('91')
  })

  it('converts to 20 when the member prefers it', () => {
    expect(formatScore(91, 20)).toBe('18,2')
  })

  it('never rounds up to a flattering integer', () => {
    expect(formatScore(89.4)).toBe('89,4')
  })
})
