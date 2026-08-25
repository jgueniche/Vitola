import { describe, expect, it } from 'vitest'

import { COMMITMENT_FLAGS, isKnownFlag, KNOWN_FLAGS, PAYLOAD_FIELDS } from '@/lib/admin/flags'
import { m } from '@/lib/i18n'

/**
 * The flag registry and its French copy.
 *
 * The screen lists what the database returns; this file only guards that what
 * the registry DOES declare stays coherent — a known flag without its copy
 * renders its raw key, which reads as a bug to the one person who uses this
 * screen.
 */

describe('the known flags', () => {
  it('are unique and all have their French copy', () => {
    expect(new Set(KNOWN_FLAGS).size).toBe(KNOWN_FLAGS.length)
    const flagCopy = m.admin.flags as Record<string, { label?: string; description?: string }>
    for (const key of KNOWN_FLAGS) {
      expect(flagCopy[key]?.label, key).toBeTruthy()
      expect(flagCopy[key]?.description, key).toBeTruthy()
    }
  })

  it('declare payload shapes only on known flags', () => {
    for (const key of Object.keys(PAYLOAD_FIELDS)) {
      expect(isKnownFlag(key), key).toBe(true)
    }
  })

  it('mark the published commitments, and those carry a warning', () => {
    const flagCopy = m.admin.flags as Record<string, { warning?: string }>
    for (const key of COMMITMENT_FLAGS) {
      expect(isKnownFlag(key), key).toBe(true)
      // A commitment flag without its warning is a trap for the one admin.
      expect(flagCopy[key]?.warning, key).toBeTruthy()
    }
  })

  it('bounds the DSA deadline the way a promise needs', () => {
    const field = PAYLOAD_FIELDS.dsa_report_sla_hours
    expect(field?.kind).toBe('hours')
    if (field?.kind === 'hours') {
      expect(field.min).toBeGreaterThanOrEqual(1)
      expect(field.max).toBeLessThanOrEqual(720)
    }
  })

  it('never offers admin as a comment floor', () => {
    const field = PAYLOAD_FIELDS.comments_min_role
    expect(field?.kind).toBe('role')
    if (field?.kind === 'role') {
      expect(field.roles).not.toContain('admin')
      expect(field.roles).toContain('member')
      expect(field.roles).toContain('contributor')
    }
  })
})
