import type { Database } from '@/lib/supabase/database.types'

/**
 * The inventory of personal data, and what erasure does to each entry.
 *
 * Required by §2 of the brief: consumption habits around tobacco may be
 * requalified as health data (art. 9 GDPR), which makes access (art. 15),
 * portability (art. 20) and erasure (art. 17) obligations rather than features.
 *
 * It is a declaration, not a query. Keeping it here — pure, importable by a
 * test, readable end to end — is what makes "did we export everything?" a
 * question with an answer. `app/api/gdpr/export` builds its response from this
 * list, so a table added without a line here is a table missing from every
 * export until someone notices.
 */

/**
 * One (table, column) pair linking a row to a data subject.
 *
 * The mapped type is what earns its keep: TypeScript rejects a table that does
 * not exist in that schema, and a column that does not exist on that table,
 * against the generated `database.types.ts`. The declaration is therefore
 * checked at build time, and the dynamic query below can be trusted.
 */
type RowKeys<T> = T extends { Row: infer R } ? keyof R & string : never

type SourceIn<S extends 'public' | 'ref'> = {
  [T in keyof Database[S]['Tables']]: {
    key: string
    schema: S
    table: T & string
    column: RowKeys<Database[S]['Tables'][T]>
    erasure: Erasure
  }
}[keyof Database[S]['Tables']]

/**
 * What happens to the rows when the account is erased.
 *
 * - `erased`      — the row goes with the account (`on delete cascade`).
 * - `anonymised`  — the row stays, the link to the person is dropped
 *                   (`on delete set null`). This is how the referential
 *                   survives a contributor leaving: an encyclopaedic fact is
 *                   not personal data, its authorship is.
 */
type Erasure = 'erased' | 'anonymised'

/**
 * A link that exists in the schema but that the export cannot reach.
 *
 * Only `mod` is in this shape today. That schema is deliberately absent from
 * PostgREST's exposed list (migration 0004): who reported whom, and what a
 * moderator did about it, is the most sensitive data in the product, and
 * unreachability is a second barrier behind RLS. The service-role client goes
 * through PostgREST like any other, so it cannot read those tables either.
 *
 * Not validated against `Database`, because the generated types do not contain
 * an unexposed schema — which is precisely why these entries are hand-written
 * and made to carry their own justification. `unreachable` is required: an
 * omission from a subject access request has to be argued, not discovered.
 */
type UnreachableSource = {
  key: string
  schema: 'mod'
  table: string
  column: string
  erasure: Erasure
  unreachable: string
}

export type PersonalDataSource = SourceIn<'public'> | SourceIn<'ref'> | UnreachableSource

export const PERSONAL_DATA_SOURCES = [
  { key: 'profile', schema: 'public', table: 'profiles', column: 'id', erasure: 'erased' },
  {
    key: 'settings',
    schema: 'public',
    table: 'profile_settings',
    column: 'id',
    erasure: 'erased',
  },
  { key: 'consents', schema: 'public', table: 'consents', column: 'user_id', erasure: 'erased' },
  /* Kept, actor dropped: the audit log is our proof that we honoured the very
     request that erased the account. Erasing it would erase the evidence. */
  {
    key: 'auditTrail',
    schema: 'public',
    table: 'audit_log',
    column: 'actor_id',
    erasure: 'anonymised',
  },

  {
    key: 'manufacturersCreated',
    schema: 'ref',
    table: 'manufacturers',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'brandsCreated',
    schema: 'ref',
    table: 'brands',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'linesCreated',
    schema: 'ref',
    table: 'lines',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'vitolasCreated',
    schema: 'ref',
    table: 'vitolas',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'cigarsCreated',
    schema: 'ref',
    table: 'cigars',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'cigarsVerified',
    schema: 'ref',
    table: 'cigars',
    column: 'verified_by',
    erasure: 'anonymised',
  },
  /* The one asymmetry worth knowing about: `author_id` is NOT NULL, so the FK
     can only cascade. Erasing a contributor destroys their revision proposals,
     including ones a third party reviewed. See the route's note. */
  {
    key: 'revisionsAuthored',
    schema: 'ref',
    table: 'cigar_revisions',
    column: 'author_id',
    erasure: 'erased',
  },
  {
    key: 'revisionsReviewed',
    schema: 'ref',
    table: 'cigar_revisions',
    column: 'reviewed_by',
    erasure: 'anonymised',
  },
  {
    key: 'imagesCreated',
    schema: 'ref',
    table: 'cigar_images',
    column: 'created_by',
    erasure: 'anonymised',
  },
  {
    key: 'boxCodesCreated',
    schema: 'ref',
    table: 'box_codes',
    column: 'created_by',
    erasure: 'anonymised',
  },

  /* The notebook (migration 0003, ADR 0004). Entries and the record of who they
     were shared with go with the account: both are the author's own act. */
  { key: 'reviews', schema: 'public', table: 'reviews', column: 'user_id', erasure: 'erased' },
  {
    key: 'sharesReceived',
    schema: 'public',
    table: 'review_shares',
    column: 'grantee_id',
    erasure: 'erased',
  },
  {
    key: 'sharesGranted',
    schema: 'public',
    table: 'review_shares',
    column: 'granted_by',
    erasure: 'erased',
  },

  /* Comments (migration 0004, ADR 0005). `hidden_by` is a moderator's act, not
     the commenter's, so it survives its author anonymised: a moderation
     decision has to stay readable after the moderator leaves. */
  { key: 'comments', schema: 'public', table: 'comments', column: 'author_id', erasure: 'erased' },
  {
    key: 'commentsHidden',
    schema: 'public',
    table: 'comments',
    column: 'hidden_by',
    erasure: 'anonymised',
  },

  /* Moderation. Declared, not exported — see UnreachableSource above. */
  {
    key: 'reportsFiled',
    schema: 'mod',
    table: 'reports',
    column: 'reporter_id',
    erasure: 'anonymised',
    unreachable:
      'The mod schema is not exposed to PostgREST, so no client can read it — ' +
      'service-role included. Closing this needs a SECURITY DEFINER RPC in ' +
      'public, and it ships with the reporting endpoint. No report exists yet.',
  },
  {
    key: 'reportsDecided',
    schema: 'mod',
    table: 'reports',
    column: 'decided_by',
    erasure: 'anonymised',
    unreachable: 'Same as reportsFiled: the mod schema is unreachable by design.',
  },
  {
    key: 'moderationActions',
    schema: 'mod',
    table: 'moderation_actions',
    column: 'moderator_id',
    erasure: 'anonymised',
    unreachable: 'Same as reportsFiled: the mod schema is unreachable by design.',
  },
] as const satisfies readonly PersonalDataSource[]

/** Every key of the inventory. An export missing one does not compile. */
export type PersonalDataKey = (typeof PERSONAL_DATA_SOURCES)[number]['key']

/**
 * The sources the export actually reads.
 *
 * The difference with `PERSONAL_DATA_SOURCES` is the whole point of the
 * distinction: the inventory declares everything we hold, this reads what can
 * be reached. An entry that drops out here without an `unreachable` reason is a
 * silent omission, which is why the type demands one.
 */
type DeclaredSource = (typeof PERSONAL_DATA_SOURCES)[number]
type ReachableSource = Exclude<DeclaredSource, { unreachable: string }>

export const READABLE_SOURCES: readonly ReachableSource[] = PERSONAL_DATA_SOURCES.filter(
  (source): source is ReachableSource => !('unreachable' in source),
)

export type PersonalDataBundle = Record<string, unknown[]>

/**
 * The slice of the Supabase client this module needs.
 *
 * Structural on purpose. It is the single place where the generated per-table
 * types are traded for dynamic table and column names, and the trade is safe
 * because `PERSONAL_DATA_SOURCES` is checked against those same generated types
 * above. It also lets the collector be unit-tested against a stub, without a
 * database and without a service key.
 */
export type PersonalDataReader = {
  schema(name: string): {
    from(table: string): {
      select(columns: string): {
        eq(
          column: string,
          value: string,
        ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
      }
    }
  }
}

/**
 * Reads every source for one subject.
 *
 * The reader must bypass RLS — a member holds no SELECT policy on `audit_log`,
 * by design — so this is called with the service-role client from a route
 * handler, never from a component. Every query is filtered on the subject's own
 * id: that filter is the whole security boundary here, which is why there is
 * exactly one place that writes it.
 *
 * Sources are read concurrently; one failing source fails the export rather
 * than returning a partial answer that looks complete.
 */
export async function collectPersonalData(
  reader: PersonalDataReader,
  subjectId: string,
): Promise<PersonalDataBundle> {
  const entries = await Promise.all(
    READABLE_SOURCES.map(async (source) => {
      const { data, error } = await reader
        .schema(source.schema)
        .from(source.table)
        .select('*')
        .eq(source.column, subjectId)

      if (error) {
        throw new Error(`${source.schema}.${source.table}.${source.column}: ${error.message}`)
      }
      return [source.key, data ?? []] as const
    }),
  )

  return Object.fromEntries(entries) as PersonalDataBundle
}
