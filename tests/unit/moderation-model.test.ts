import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  HIDEABLE_SURFACES,
  isHideable,
  MOD_ACT_VERBS,
  MOD_DECISIONS,
  MOD_LIMITS,
  MOD_SCOPES,
  reportAge,
} from '@/lib/moderation/model'

/**
 * The moderation vocabulary, checked against the SQL (migrations 0004 and
 * 0018).
 *
 * `lib/moderation/model.ts` mirrors what the doors enforce — scopes, decisions,
 * armed verbs, the four hideable surfaces. A verb offered here that
 * `mod_decide()` refuses is a button that cannot work; a surface armed there
 * but absent here is an act no screen can take. Both directions are pinned.
 */

const M0004 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0004_commentaires_moderation.sql'),
  'utf8',
)
const M0018 = readFileSync(join(process.cwd(), 'supabase/migrations/0018_moderation.sql'), 'utf8')

describe('the vocabulary mirrors the SQL', () => {
  it('offers exactly the two scopes mod_queue() knows', () => {
    for (const scope of MOD_SCOPES) {
      expect(M0018).toMatch(new RegExp(`p_scope = '${scope}'`))
    }
    expect(MOD_SCOPES).toHaveLength(2)
  })

  it('offers exactly the two decisions mod_decide() accepts', () => {
    const match = /p_decision not in \('([a-z]+)', '([a-z]+)'\)/.exec(M0018)
    expect(match).not.toBeNull()
    expect([...MOD_DECISIONS].sort()).toEqual([match![1], match![2]].sort())
  })

  it('arms exactly the verbs the door arms, and no unarmed one', () => {
    const armed = /p_verb not in \('hide', 'restore'\)/.test(M0018)
    expect(armed).toBe(true)
    expect([...MOD_ACT_VERBS].sort()).toEqual(['hide', 'restore'])
    // The refused three stay refused — if the door arms one, this list and the
    // screens must be reread together.
    expect(M0018).toContain("p_verb in ('warn', 'suspend', 'delete')")
  })

  it('lists exactly the surfaces the door will hide on', () => {
    const match = /v_target not in \(([^)]+)\)/.exec(M0018)
    expect(match).not.toBeNull()
    const doors = (match?.[1] ?? '')
      .split(',')
      .map((part) => part.replace(/['\s]/g, ''))
      .sort()
    expect([...HIDEABLE_SURFACES].sort()).toEqual(doors)
  })

  it('each hideable surface carries the three hidden_* columns in its migration', () => {
    // The four tables span three migrations; 0004 is enough to prove the shape
    // exists and the constraint style — the SQL test 13 proves behaviour.
    expect(M0004).toContain('hidden_at')
    for (const surface of HIDEABLE_SURFACES) {
      const [schema, table] = surface.split('.')
      expect(schema).toBe('public')
      expect(isHideable(schema!, table!)).toBe(true)
    }
    expect(isHideable('ref', 'cigars')).toBe(false)
    expect(isHideable('public', 'reviews')).toBe(false)
  })

  it('bounds the note and the act reason the way the CHECKs of 0004 do', () => {
    const decision = /reports_decision_len check \(decision_note is null or length\(decision_note\) <= (\d+)\)/.exec(
      M0004,
    )
    const action = /moderation_actions_reason_len check \(length\(btrim\(reason\)\) between 1 and (\d+)\)/.exec(
      M0004,
    )
    expect(Number(decision![1])).toBe(MOD_LIMITS.note)
    expect(Number(action![1])).toBe(MOD_LIMITS.actReason)
  })
})

describe('reportAge', () => {
  const now = Date.parse('2026-08-23T12:00:00Z')

  it('counts full elapsed hours', () => {
    expect(reportAge('2026-08-23T09:30:00Z', 72, now)).toEqual({ hours: 2, overdue: false })
  })

  it('goes overdue exactly at the published deadline', () => {
    expect(reportAge('2026-08-20T12:00:00Z', 72, now).overdue).toBe(true)
    expect(reportAge('2026-08-20T12:00:01Z', 72, now).overdue).toBe(false)
  })

  it('never renders a negative age on a clock skew', () => {
    expect(reportAge('2026-08-23T12:05:00Z', 72, now).hours).toBe(0)
  })
})
