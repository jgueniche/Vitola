import { describe, expect, it } from 'vitest'

import {
  collectPersonalData,
  PERSONAL_DATA_SOURCES,
  READABLE_SOURCES,
  type PersonalDataReader,
} from '@/lib/compliance/gdpr'

const SUBJECT = '11111111-1111-4111-8111-111111111111'

/** Records every (schema, table, column, value) triple it is asked for. */
function reader(options: { failOn?: string } = {}) {
  const calls: string[] = []

  const client: PersonalDataReader = {
    schema: (schemaName) => ({
      from: (table) => ({
        select: () => ({
          eq: (column, value) => {
            const source = `${schemaName}.${table}.${column}`
            calls.push(`${source}=${value}`)
            return Promise.resolve(
              options.failOn === source
                ? { data: null, error: { message: 'permission denied' } }
                : { data: [{ source }], error: null },
            )
          },
        }),
      }),
    }),
  }

  return { client, calls }
}

describe('collectPersonalData', () => {
  it('returns one entry per declared source, and nothing else', async () => {
    const { client } = reader()
    const bundle = await collectPersonalData(client, SUBJECT)

    expect(Object.keys(bundle).sort()).toEqual(READABLE_SOURCES.map((s) => s.key).sort())
  })

  /*
   * The security boundary of the whole export is this filter. Nothing else
   * stands between one member's request and another member's data, because the
   * service-role client bypasses RLS by design — a member holds no SELECT policy
   * on audit_log, so RLS alone cannot produce a complete export.
   */
  it('filters every single source on the subject id', async () => {
    const { client, calls } = reader()
    await collectPersonalData(client, SUBJECT)

    expect(calls).toHaveLength(READABLE_SOURCES.length)
    for (const call of calls) {
      expect(call.endsWith(`=${SUBJECT}`)).toBe(true)
    }
  })

  it('reads each source at the schema, table and column it declares', async () => {
    const { client, calls } = reader()
    await collectPersonalData(client, SUBJECT)

    for (const source of READABLE_SOURCES) {
      expect(calls).toContain(`${source.schema}.${source.table}.${source.column}=${SUBJECT}`)
    }
  })

  /*
   * A partial export is the dangerous outcome: it looks complete, and the
   * missing part is invisible to the person who received it. Failing loudly is
   * the only honest answer.
   */
  it('fails the whole export when one source cannot be read', async () => {
    const { client } = reader({ failOn: 'public.audit_log.actor_id' })

    await expect(collectPersonalData(client, SUBJECT)).rejects.toThrow(/audit_log.*permission/)
  })

  it('treats an empty source as empty, not as missing', async () => {
    const client: PersonalDataReader = {
      schema: () => ({
        from: () => ({
          select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    }

    const bundle = await collectPersonalData(client, SUBJECT)
    expect(bundle.profile).toEqual([])
    expect(bundle.consents).toEqual([])
  })

  /*
   * The dangerous shape is a source that quietly stops being read. Dropping out
   * of the export is allowed — the mod schema is not reachable through
   * PostgREST — but only against a written reason, which the type demands and
   * this asserts is not an empty string standing in for one.
   */
  it('omits a source only when it carries a reason', () => {
    const readable = new Set<string>(READABLE_SOURCES.map((s) => s.key))
    for (const source of PERSONAL_DATA_SOURCES) {
      if (readable.has(source.key)) continue
      expect('unreachable' in source).toBe(true)
      if ('unreachable' in source) {
        expect(source.unreachable.length).toBeGreaterThan(30)
      }
    }
  })

  it('still declares more than it reads, and knows the difference', () => {
    expect(PERSONAL_DATA_SOURCES.length).toBeGreaterThan(READABLE_SOURCES.length)
  })
})
