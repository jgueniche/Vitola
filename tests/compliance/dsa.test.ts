import { readdirSync, readFileSync } from 'node:fs'
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

/**
 * Every migration, in the order they apply.
 *
 * A CHECK is not written once. `reports_entity_known` was created by 0004 and
 * replaced by 0010, which added the two surfaces the feed opened — so a test
 * reading 0004 alone asserts against a constraint the database no longer has,
 * and it fails for the right reason at the wrong place. What has to be checked
 * is the constraint **as the migrations leave it**, which is the last
 * definition, whichever file carries it.
 */
const MIGRATIONS = readdirSync(join(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map(migration)

/** The last definition of a named CHECK across the whole migration history. */
function lastCheck(name: string): string | null {
  const pattern = new RegExp(`constraint ${name} check \\(([\\s\\S]*?)\\n *\\)`, 'g')
  let found: string | null = null
  for (const sql of MIGRATIONS) {
    for (const hit of sql.matchAll(pattern)) found = hit[1] ?? found
  }
  return found
}

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
    const block = lastCheck('reports_entity_known')
    expect(block, 'reports_entity_known is in no migration at all').not.toBeNull()

    for (const { schema, table } of Object.values(REPORTABLE)) {
      expect(block).toContain(`'${schema}.${table}'`)
    }
  })

  it('are the only ones the CHECK allows', () => {
    /*
     * The converse, and it is the half that catches the omission that matters.
     * A surface added to the CHECK but not to `REPORTABLE` is a table the queue
     * would accept notices about and no screen offers a button for — which is
     * how `profiles` sat in the constraint from migration 0004 until P3 gave a
     * profile a page. That was a deliberate wait, written down; the next one
     * would be an oversight, and this is where it stops being silent.
     */
    const block = lastCheck('reports_entity_known') ?? ''
    const allowed = [...block.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((hit) => hit[1])
    const offered = Object.values(REPORTABLE).map(({ schema, table }) => `${schema}.${table}`)

    expect([...allowed].sort()).toEqual([...offered].sort())
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
