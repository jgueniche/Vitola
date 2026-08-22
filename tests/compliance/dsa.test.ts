import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DSA_SLA_HOURS,
  REPORTABLE,
  REPORT_REASONS,
  type ReportReason,
} from '@/lib/compliance/dsa'

/**
 * The reporting mechanism, checked against the SQL that defines it.
 *
 * ADR 0005 demands a mechanism, a queue and a published deadline, and the three
 * live in three places: an API route, `mod.reports`, and the legal notice. That
 * is the right split — a deadline that engages us must be turnable without a
 * deploy — and it is exactly the shape that drifts. Each declaration in
 * `lib/compliance/dsa.ts` is therefore read back out of the migration it mirrors.
 *
 * The failure this prevents is not a crash. It is a legal notice announcing 72
 * hours over a queue configured for something else, or a reason offered in a
 * form that the enum refuses on submit — both of which look fine until someone
 * uses them.
 */

const migration = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8')

const M0004 = migration('0004_commentaires_moderation.sql')
const M0006 = migration('0006_signalement_et_statistiques.sql')

describe('the announced deadline', () => {
  it('is the value the feature flag was created holding', () => {
    const payload = /'dsa_report_sla_hours'[\s\S]*?'\{"hours":\s*(\d+)\}'::jsonb/.exec(M0004)
    expect(payload, 'the dsa_report_sla_hours flag is no longer in migration 0004').not.toBeNull()
    expect(Number(payload?.[1])).toBe(DSA_SLA_HOURS)
  })

  it('is a real number of hours, not a placeholder', () => {
    expect(DSA_SLA_HOURS).toBeGreaterThan(0)
    expect(Number.isInteger(DSA_SLA_HOURS)).toBe(true)
  })
})

describe('the reasons offered', () => {
  it('are exactly the values of mod.report_reason', () => {
    const block = /create type mod\.report_reason as enum \(([\s\S]*?)\);/.exec(M0004)
    expect(block, 'mod.report_reason is no longer declared in migration 0004').not.toBeNull()

    const declared = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1])

    // Sorted on both sides: the order in the form is an editorial choice — the
    // tobacco one first, "other" last — and it is not the order of the enum.
    expect([...REPORT_REASONS].sort()).toEqual([...declared].sort())
  })

  it('each has a label in the French messages', async () => {
    const fr = (await import('@/messages/fr.json')).default
    for (const reason of REPORT_REASONS) {
      const label = fr.moderation.report.reasons[reason as ReportReason]
      expect(label, `no label for the reason "${reason}"`).toBeTruthy()
    }
  })
})

describe('the surfaces that can be reported', () => {
  it('are all inside the CHECK that bounds the queue', () => {
    const block = /constraint reports_entity_known check \(([\s\S]*?)\n  \)/.exec(M0004)
    expect(block, 'reports_entity_known is no longer in migration 0004').not.toBeNull()

    for (const { schema, table } of Object.values(REPORTABLE)) {
      expect(block?.[1]).toContain(`'${schema}.${table}'`)
    }
  })
})

describe('the door onto the mod schema', () => {
  /*
   * The whole point of migration 0006 is that it opens one function and not a
   * schema. A grant to `authenticated` would turn the moderation queue into a
   * table a browser can write to, and nothing in the application would change
   * shape — the endpoint would keep working, which is what makes it worth an
   * assertion here as well as in the migration's own self-check.
   */
  it('is granted to the service role and revoked from everyone else', () => {
    for (const fn of ['file_report', 'moderation_records_for_subject']) {
      expect(M0006).toMatch(new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]{0,120}from public`))
      expect(M0006).toMatch(
        new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]{0,120}from anon, authenticated`),
      )
      expect(M0006).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,120}to service_role`),
      )
    }
  })

  it('is never granted to anon or authenticated anywhere in the file', () => {
    const grants = [...M0006.matchAll(/grant execute on function[\s\S]{0,200}?;/g)].map((m) => m[0])
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) {
      expect(grant).not.toMatch(/to [^;]*\b(anon|authenticated)\b/)
    }
  })
})
