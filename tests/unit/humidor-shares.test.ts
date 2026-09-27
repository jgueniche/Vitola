import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PERSONAL_DATA_SOURCES } from '@/lib/compliance/gdpr'
import { ANSWER_DONE, HUMIDOR_DONE, SHARE_ANSWERS, answersFor } from '@/lib/humidor/model'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { humidorConfirmation } from '@/lib/social/confirmations'

/**
 * Sharing a humidor (migration 0036, ADR 0022), checked against the SQL.
 *
 * The database is the boundary — `supabase/tests/23_cave_partage.sql` proves
 * it, and it is the only place that can. What these tests pin is the half of
 * the feature TypeScript owns: which buttons a page offers, what a `?fait=`
 * says, and three promises the migration makes that a later edit to this side
 * could quietly break — that hiding needs an acceptance, that the owner never
 * reads `hidden_at`, and that neither door returns a price.
 */

const M0036 = readFileSync(
  join(process.cwd(), 'supabase/migrations/0036_cave_personnelle_et_partage.sql'),
  'utf8',
)

/** The `returns table (…)` of one function, as written in the migration. */
function returnedColumns(name: string): string[] {
  const match = new RegExp(
    `function public\\.${name}\\([^)]*\\)\\s*returns table \\(([^)]*)\\)`,
  ).exec(M0036)
  if (!match?.[1]) throw new Error(`${name} not found in 0036`)
  return match[1]
    .split(',')
    .map((column) => column.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
}

describe('what a page offers for a share', () => {
  it('offers an invitation two answers: accept or decline', () => {
    expect(answersFor({ accepted_at: null, hidden_at: null })).toEqual(['accept', 'decline'])
  })

  it('offers an accepted cave hiding or leaving, and a hidden one showing or leaving', () => {
    const accepted = '2026-09-26T16:00:00Z'
    expect(answersFor({ accepted_at: accepted, hidden_at: null })).toEqual(['hide', 'leave'])
    expect(answersFor({ accepted_at: accepted, hidden_at: accepted })).toEqual(['show', 'leave'])
  })

  /* The CHECK is the rule, the function is the courtesy: a button the database
     would refuse is a button that lies. */
  it('never offers to hide an invitation, which humidor_shares_hidden_once_accepted refuses', () => {
    expect(M0036).toMatch(/check \(hidden_at is null or accepted_at is not null\)/)
    expect(answersFor({ accepted_at: null, hidden_at: null })).not.toContain('hide')
  })

  it('names every answer once', () => {
    expect(new Set(SHARE_ANSWERS).size).toBe(SHARE_ANSWERS.length)
  })
})

describe('what /cave says after a gesture', () => {
  it('gives every answer a code, and every code a sentence', () => {
    for (const answer of SHARE_ANSWERS) {
      expect(Object.values(HUMIDOR_DONE)).toContain(ANSWER_DONE[answer])
    }
    for (const code of Object.values(HUMIDOR_DONE)) {
      expect(humidorConfirmation(code)).toBeTruthy()
      expect(code).toMatch(/^[a-z]+$/)
    }
    expect(new Set(Object.values(HUMIDOR_DONE)).size).toBe(Object.keys(HUMIDOR_DONE).length)
  })

  it('says the deletion happened — the sentence the silent 204 never produced', () => {
    expect(humidorConfirmation(HUMIDOR_DONE.deleted)).toBe(m.humidor.deleted)
  })

  it('renders nothing for a code it does not know, since the URL is the attacker’s', () => {
    expect(humidorConfirmation('<script>')).toBeNull()
    expect(humidorConfirmation(undefined)).toBeNull()
    expect(humidorConfirmation([HUMIDOR_DONE.left, 'x'])).toBe(m.humidor.shared.done.left)
  })
})

describe('the promises of migration 0036', () => {
  it('keeps hidden_at out of what authenticated may select', () => {
    const grant = /grant select \(([^)]*)\)\s*on public\.humidor_shares to authenticated/.exec(
      M0036,
    )
    expect(grant?.[1]).toBeDefined()
    expect(grant?.[1]).not.toMatch(/hidden_at/)
    expect(grant?.[1]).toMatch(/accepted_at/)
  })

  it('lets nobody insert an answer in place of the recipient', () => {
    expect(M0036).toMatch(/grant insert \(humidor_id, recipient_id\) on public\.humidor_shares/)
    expect(M0036).toMatch(/grant update \(accepted_at, hidden_at\) on public\.humidor_shares/)
  })

  /* A policy filters rows and cannot hide a column; the return type is the
     boundary, so the return type is what is read (ADR 0007 D5, ADR 0022 D3). */
  it('returns neither a price nor a vendor, a note, a box code, a position or a ledger', () => {
    const forbidden = /price|purchase|vendor|note|box|position|event|reading|user_id|recipient/
    for (const name of ['humidor_shares_received', 'shared_humidor_lots']) {
      const columns = returnedColumns(name)
      expect(columns.length).toBeGreaterThan(0)
      for (const column of columns) expect(column).not.toMatch(forbidden)
    }
    expect(returnedColumns('shared_humidor_lots')).toEqual(['cigar_id', 'qty', 'aging_days'])
  })

  it('locks the four humidor tables with restrictive policies that cover every command', () => {
    for (const table of ['humidors', 'humidor_items', 'humidor_events', 'humidor_readings']) {
      expect(M0036).toMatch(
        new RegExp(
          `create policy ${table}_owner_only on public\\.${table}\\s+as restrictive for all`,
        ),
      )
    }
    expect(M0036).toMatch(/drop policy if exists humidors_select_shown on public\.humidors/)
  })
})

describe('the export and the address', () => {
  it('exports both sides of a share, and the owner’s side without the recipient’s choice', () => {
    const received = PERSONAL_DATA_SOURCES.find((s) => s.key === 'humidorSharesReceived')
    const granted = PERSONAL_DATA_SOURCES.find((s) => s.key === 'humidorSharesGranted')
    expect(received).toMatchObject({ table: 'humidor_shares', column: 'recipient_id' })
    expect(granted).toMatchObject({ table: 'humidor_shares', column: 'humidors.user_id' })
    expect(granted && 'select' in granted ? granted.select : '').not.toMatch(/hidden_at|\*/)
  })

  it('reads a shared cave at its own address, away from the owner’s page', () => {
    expect(routes.humidorShared('abc')).toBe('/cave/partagee/abc')
    expect(routes.humidorShared('abc')).not.toBe(routes.humidorDetail('abc'))
  })
})
