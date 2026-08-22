import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PERSONAL_DATA_SOURCES } from '@/lib/compliance/gdpr'

/**
 * §2 of the brief requires an export and an erasure endpoint from Phase 1. Both
 * are only as complete as `PERSONAL_DATA_SOURCES`, and that list is hand-written
 * — so it is checked against the schema rather than trusted.
 *
 * Two things are asserted, and the second is the one that catches a lie:
 *
 *   1. every column in the schema that points at `auth.users` is declared;
 *   2. the erasure behaviour we *claim* for it matches the `ON DELETE` clause
 *      the database actually enforces. A source documented as "anonymised" that
 *      in fact cascades is worse than an undocumented one: it is a promise the
 *      database does not keep.
 *
 * The intent is a migration that adds a user link without touching the export.
 * That is a silent failure — nothing breaks, people just stop receiving part of
 * their data — which is exactly the kind this repository asserts against.
 */

/** Migration 0001 still lives in docs/phase-0/; see supabase/migrations/README.md. */
const SCHEMA_FILES = [
  join(process.cwd(), 'docs/phase-0/03-schema-p1.sql'),
  ...readdirSync(join(process.cwd(), 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => join(process.cwd(), 'supabase/migrations', name)),
]

type Link = { source: string; erasure: 'erased' | 'anonymised' }

const TABLE_START = /^create table (?:if not exists )?(\w+)\.(\w+)\s*\(/
const TABLE_END = /^\)\s*;/
const USER_LINK = /^\s+(\w+)\s+uuid\b.*references auth\.users/
const ON_DELETE = /on delete (cascade|set null)/

function userLinks(): Link[] {
  const links: Link[] = []

  for (const file of SCHEMA_FILES) {
    let table: string | null = null

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const start = TABLE_START.exec(line)
      if (start) {
        table = `${start[1]}.${start[2]}`
        continue
      }
      if (table && TABLE_END.test(line)) {
        table = null
        continue
      }
      if (!table) continue

      const column = USER_LINK.exec(line)
      if (!column) continue

      const onDelete = ON_DELETE.exec(line)?.[1]
      links.push({
        source: `${table}.${column[1]}`,
        erasure: onDelete === 'cascade' ? 'erased' : 'anonymised',
      })
    }
  }

  return links
}

describe('GDPR personal-data inventory', () => {
  const links = userLinks()

  /*
   * Guards the guard. An assertion whose test data does not exist passes
   * without testing anything — the lesson T8 taught this repository. If the
   * parser silently stopped matching, every assertion below would go green on
   * an empty list.
   */
  it('actually finds the user links in the schema', () => {
    expect(links.length).toBeGreaterThanOrEqual(13)
    expect(links.map((l) => l.source)).toContain('public.profiles.id')
    expect(links.map((l) => l.source)).toContain('ref.cigars.verified_by')
  })

  it('declares every column that points at auth.users', () => {
    const declared = new Set(PERSONAL_DATA_SOURCES.map((s) => `${s.schema}.${s.table}.${s.column}`))
    const missing = links.map((l) => l.source).filter((source) => !declared.has(source))

    expect(missing).toEqual([])
  })

  it('declares an erasure behaviour that matches the ON DELETE clause', () => {
    const declared = new Map(
      PERSONAL_DATA_SOURCES.map((s) => [`${s.schema}.${s.table}.${s.column}`, s.erasure]),
    )
    const lying = links
      .filter((link) => declared.has(link.source) && declared.get(link.source) !== link.erasure)
      .map(
        (link) => `${link.source}: declared ${declared.get(link.source)}, SQL says ${link.erasure}`,
      )

    expect(lying).toEqual([])
  })

  /*
   * `profile_settings.id` references `profiles`, not `auth.users`, so the parser
   * above cannot see it — yet it holds the birth date, which is exactly the kind
   * of thing an export must not omit. It is declared on purpose and pinned here
   * so a cleanup does not "tidy away" an entry the parser would never miss.
   */
  it('declares the tables that reach auth.users indirectly', () => {
    const declared = PERSONAL_DATA_SOURCES.map((s) => `${s.schema}.${s.table}.${s.column}`)
    expect(declared).toContain('public.profile_settings.id')
  })

  it('gives every source a unique key', () => {
    const keys = PERSONAL_DATA_SOURCES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
