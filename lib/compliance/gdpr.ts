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
 * A link the export reaches through a function rather than through a table.
 *
 * `mod` is deliberately absent from PostgREST's exposed list (migration 0004):
 * who reported whom, and what a moderator did about it, is the most sensitive
 * data in the product, and unreachability is a second barrier behind RLS. The
 * service-role client goes through PostgREST like any other and holds no
 * privilege in that schema — checked on the project, not assumed.
 *
 * Until August 2026 that made these three links `UnreachableSource`s, declared
 * and not exported, on the argument that no report existed. Migration 0006
 * ended that argument in the same file that created the first report: it opens
 * one SECURITY DEFINER function in `public`, callable by the service role
 * alone, which returns a subject their own records. The schema stays closed;
 * what crosses is a door the size of one gesture.
 *
 * Not validated against `Database`, because the generated types do not contain
 * an unexposed schema. That is why these entries are hand-written and made to
 * carry the name of the function that reads them.
 */
type RpcSource = {
  key: string
  schema: 'mod'
  table: string
  column: string
  erasure: Erasure
  /** The function in `public` that reads it, and the key it answers under. */
  rpc: 'moderation_records_for_subject'
}

/**
 * A link that exists in the schema and that nothing can currently read.
 *
 * Empty today, and that is the point of keeping the shape: `unreachable` is
 * required text, so the next omission has to be argued rather than discovered.
 * An omission from a subject access request is a decision, not an accident.
 */
type UnreachableSource = {
  key: string
  schema: 'mod'
  table: string
  column: string
  erasure: Erasure
  unreachable: string
}

/**
 * A table whose link to the person is one hop away.
 *
 * The humidor is the first of these (migration 0008). A lot, a ledger entry and
 * a hygrometry reading are unmistakably personal data — what one owns, what one
 * smoked and when — yet none of them carries a `user_id`: they hang off
 * `humidors`, which does. Denormalising the column to make the export simpler
 * would put a second copy of the ownership fact in the schema, and ADR 0006
 * spends its length arguing against exactly that kind of second source.
 *
 * So the link is expressed the way PostgREST expresses it: an inner embed, and
 * a filter on the embedded column. `column` is then a path rather than a name,
 * which is why these entries cannot use `SourceIn` — the mapped type checks
 * `column` against the row's own keys, and it is right to.
 *
 * The collector needs no branch for them: it already reads `column` and now
 * reads `select`. One shape, two ways of naming the same subject.
 */
type EmbeddedSourceIn<S extends 'public'> = {
  [T in keyof Database[S]['Tables']]: {
    key: string
    schema: S
    table: T & string
    /** PostgREST filter path through the embed, e.g. `humidors.user_id`. */
    column: `${string}.${string}`
    /** The `select` that makes the embed an inner join, so the filter bites. */
    select: string
    erasure: Erasure
  }
}[keyof Database[S]['Tables']]

export type PersonalDataSource =
  | SourceIn<'public'>
  | SourceIn<'ref'>
  | EmbeddedSourceIn<'public'>
  | RpcSource
  | UnreachableSource

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

  /* The humidor (migration 0008, ADR 0006). Everything here goes with the
     account: `humidors.user_id` cascades, and the other three cascade behind it
     through their parent. Only the first is a direct link, so only the first is
     what the schema parser in tests/compliance can see — the other three are
     declared because an export that returned a member's caves without their
     contents would answer art. 15 with a list of empty boxes. */
  { key: 'humidors', schema: 'public', table: 'humidors', column: 'user_id', erasure: 'erased' },
  {
    key: 'humidorItems',
    schema: 'public',
    table: 'humidor_items',
    column: 'humidors.user_id',
    select: '*, humidors!inner(user_id)',
    erasure: 'erased',
  },
  {
    key: 'humidorEvents',
    schema: 'public',
    table: 'humidor_events',
    column: 'humidor_items.humidors.user_id',
    select: '*, humidor_items!inner(humidors!inner(user_id))',
    erasure: 'erased',
  },
  {
    key: 'humidorReadings',
    schema: 'public',
    table: 'humidor_readings',
    column: 'humidors.user_id',
    select: '*, humidors!inner(user_id)',
    erasure: 'erased',
  },

  /* Le social (migration 0010, ADR 0007). Onze colonnes pointent auth.users, et
     chacune est ici parce que `tests/compliance/gdpr-inventory.test.ts` relit le
     SQL et refuse d'en laisser passer une. C'est le garde-fou qui a mordu en
     P3, comme il avait mordu pour la cave.

     Les deux sens d'un abonnement sont exportés séparément, et ce n'est pas de
     la symétrie gratuite : « qui je suis » et « qui me suit » ne répondent pas
     à la même question de l'art. 15, et une seule ligne les confondrait.

     `hidden_by` survit anonymisé, sur les deux tables : c'est l'acte d'un
     modérateur, pas de l'auteur, et une décision de modération doit rester
     lisible après le départ de qui l'a prise. Même règle que `comments`.

     `notifications.actor_id` est le seul cas légèrement contre-intuitif : il
     cascade plutôt que de s'anonymiser, parce qu'une notification dont l'auteur
     a disparu n'a plus rien à dire — « quelqu'un a braisé votre publication »
     sans le quelqu'un n'est pas une information, c'est un résidu. */
  {
    key: 'following',
    schema: 'public',
    table: 'follows',
    column: 'follower_id',
    erasure: 'erased',
  },
  {
    key: 'followers',
    schema: 'public',
    table: 'follows',
    column: 'followee_id',
    erasure: 'erased',
  },
  { key: 'blocksMade', schema: 'public', table: 'blocks', column: 'blocker_id', erasure: 'erased' },
  {
    key: 'blocksReceived',
    schema: 'public',
    table: 'blocks',
    column: 'blocked_id',
    erasure: 'erased',
  },
  { key: 'posts', schema: 'public', table: 'posts', column: 'author_id', erasure: 'erased' },
  {
    key: 'postsHidden',
    schema: 'public',
    table: 'posts',
    column: 'hidden_by',
    erasure: 'anonymised',
  },
  {
    key: 'embers',
    schema: 'public',
    table: 'post_reactions',
    column: 'user_id',
    erasure: 'erased',
  },
  {
    key: 'postComments',
    schema: 'public',
    table: 'post_comments',
    column: 'author_id',
    erasure: 'erased',
  },
  {
    key: 'postCommentsHidden',
    schema: 'public',
    table: 'post_comments',
    column: 'hidden_by',
    erasure: 'anonymised',
  },
  {
    key: 'notifications',
    schema: 'public',
    table: 'notifications',
    column: 'user_id',
    erasure: 'erased',
  },
  {
    key: 'notificationsCaused',
    schema: 'public',
    table: 'notifications',
    column: 'actor_id',
    erasure: 'erased',
  },

  /* Moderation. Read through migration 0006's function — see RpcSource above.
     The keys are the ones that function answers under, and they are the same
     strings: a rename on one side has to be a rename on both. */
  {
    key: 'reportsFiled',
    schema: 'mod',
    table: 'reports',
    column: 'reporter_id',
    erasure: 'anonymised',
    rpc: 'moderation_records_for_subject',
  },
  {
    key: 'reportsDecided',
    schema: 'mod',
    table: 'reports',
    column: 'decided_by',
    erasure: 'anonymised',
    rpc: 'moderation_records_for_subject',
  },
  {
    key: 'moderationActions',
    schema: 'mod',
    table: 'moderation_actions',
    column: 'moderator_id',
    erasure: 'anonymised',
    rpc: 'moderation_records_for_subject',
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
type ReachableSource = Exclude<DeclaredSource, { unreachable: string } | { rpc: string }>
type RpcReachableSource = Extract<DeclaredSource, { rpc: string }>

export const READABLE_SOURCES: readonly ReachableSource[] = PERSONAL_DATA_SOURCES.filter(
  (source): source is ReachableSource => !('unreachable' in source) && !('rpc' in source),
)

/** The sources read through a function rather than through a table. */
export const RPC_SOURCES: readonly RpcReachableSource[] = PERSONAL_DATA_SOURCES.filter(
  (source): source is RpcReachableSource => 'rpc' in source,
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
        .select('select' in source ? source.select : '*')
        .eq(source.column, subjectId)

      if (error) {
        throw new Error(`${source.schema}.${source.table}.${source.column}: ${error.message}`)
      }
      return [source.key, data ?? []] as const
    }),
  )

  return Object.fromEntries(entries) as PersonalDataBundle
}

/**
 * The slice of the client that calls the moderation function.
 *
 * Separate from `PersonalDataReader` because it is a different kind of read —
 * one call, one object, no table names — and because keeping it separate makes
 * the asymmetry visible: everything else in this file reads tables, these three
 * links cannot.
 */
export type ModerationReader = {
  rpc(
    name: 'moderation_records_for_subject',
    args: { p_subject: string },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/**
 * Reads the three `mod` links for one subject, through migration 0006.
 *
 * Fails the export if the call fails, exactly like a table source: a subject
 * access request that silently drops the moderation records would be the
 * omission this file exists to prevent, only harder to notice than before —
 * the keys would be there, holding nothing.
 *
 * A key the function does not answer under comes back as an empty array rather
 * than as `undefined`, so the shape of the export does not depend on whether
 * the person has ever reported anything.
 */
export async function collectModerationRecords(
  reader: ModerationReader,
  subjectId: string,
): Promise<PersonalDataBundle> {
  const { data, error } = await reader.rpc('moderation_records_for_subject', {
    p_subject: subjectId,
  })

  if (error) {
    throw new Error(`moderation_records_for_subject: ${error.message}`)
  }

  const records = (data ?? {}) as Record<string, unknown>

  return Object.fromEntries(
    RPC_SOURCES.map((source) => {
      const value = records[source.key]
      return [source.key, Array.isArray(value) ? value : []]
    }),
  )
}
