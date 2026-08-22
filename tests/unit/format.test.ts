import { describe, expect, it } from 'vitest'

import {
  formatDimensions,
  formatScore,
  millimetresToInches,
  todayInBrandZone,
} from '@/lib/format'

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

describe('todayInBrandZone', () => {
  it('formats as the YYYY-MM-DD an <input type="date"> wants', () => {
    expect(todayInBrandZone(new Date('2026-08-22T12:00:00Z'))).toBe('2026-08-22')
  })

  it('is the audience\'s day, not the server\'s', () => {
    // 00:30 in Paris on the 23rd is still the 22nd in UTC. A server rendering
    // UTC would offer yesterday as the default for "quand l'avez-vous fumé",
    // at exactly the hour someone puts a cigar down and writes it up.
    expect(todayInBrandZone(new Date('2026-08-22T22:30:00Z'))).toBe('2026-08-23')
  })
})
