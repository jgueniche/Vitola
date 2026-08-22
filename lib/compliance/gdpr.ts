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

export type PersonalDataSource = SourceIn<'public'> | SourceIn<'ref'>

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
] as const satisfies readonly PersonalDataSource[]

/** Every key of the inventory. An export missing one does not compile. */
export type PersonalDataKey = (typeof PERSONAL_DATA_SOURCES)[number]['key']

export type PersonalDataBundle = Record<PersonalDataKey, unknown[]>

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
    PERSONAL_DATA_SOURCES.map(async (source) => {
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
