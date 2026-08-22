import { describe, expect, it } from 'vitest'

import {
  collectPersonalData,
  PERSONAL_DATA_SOURCES,
  READABLE_SOURCES,
  RPC_SOURCES,
  collectModerationRecords,
  type ModerationReader,
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
   * The dangerous shape is a source that quietly stops being read. A source may
   * leave the table path — the mod schema is not reachable through PostgREST —
   * but only towards a named function or against a written reason. Neither is
   * allowed to be an empty string standing in for one.
   */
  it('leaves the table path only towards a function or a written reason', () => {
    const readable = new Set<string>(READABLE_SOURCES.map((s) => s.key))
    for (const source of PERSONAL_DATA_SOURCES) {
      if (readable.has(source.key)) continue
      const routed = 'rpc' in source || 'unreachable' in source
      expect(routed).toBe(true)
      /* `typeof` and not just `in`: no entry carries `unreachable` today, so
         the union has no member declaring it and the property narrows to
         `unknown`. Keeping the branch is deliberate — the shape must survive
         its own emptiness, or the next omission has nowhere to be argued. */
      if ('unreachable' in source && typeof source.unreachable === 'string') {
        expect(source.unreachable.length).toBeGreaterThan(30)
      }
      if ('rpc' in source && typeof source.rpc === 'string') {
        expect(source.rpc.length).toBeGreaterThan(0)
      }
    }
  })

  it('still declares more than it reads from a table, and knows the difference', () => {
    expect(PERSONAL_DATA_SOURCES.length).toBeGreaterThan(READABLE_SOURCES.length)
    expect(RPC_SOURCES.length).toBeGreaterThan(0)
  })

  /*
   * The moderation records are three keys of one object. The failure worth
   * catching is not "the call errored" but "the call answered, and the keys
   * were not there" — the export would then carry three empty arrays and look
   * complete. Hence a stub that answers with the wrong shape.
   */
  it('reads the three moderation links through one call', async () => {
    const calls: unknown[] = []
    const reader: ModerationReader = {
      rpc: (name, args) => {
        calls.push({ name, args })
        return Promise.resolve({
          data: { reportsFiled: [{ id: 'r1' }], reportsDecided: [], moderationActions: [] },
          error: null,
        })
      },
    }

    const bundle = await collectModerationRecords(reader, SUBJECT)
    expect(calls).toEqual([
      { name: 'moderation_records_for_subject', args: { p_subject: SUBJECT } },
    ])
    expect(Object.keys(bundle).sort()).toEqual(RPC_SOURCES.map((s) => s.key).sort())
    expect(bundle.reportsFiled).toEqual([{ id: 'r1' }])
  })

  it('turns a missing key into an empty array, never into undefined', async () => {
    const reader: ModerationReader = {
      rpc: () => Promise.resolve({ data: {}, error: null }),
    }

    const bundle = await collectModerationRecords(reader, SUBJECT)
    for (const source of RPC_SOURCES) expect(bundle[source.key]).toEqual([])
  })

  it('fails the export when the moderation call fails', async () => {
    const reader: ModerationReader = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
    }

    await expect(collectModerationRecords(reader, SUBJECT)).rejects.toThrow(/permission denied/)
  })
})
