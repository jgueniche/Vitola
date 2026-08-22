import { NextResponse } from 'next/server'

import { BRAND } from '@/lib/brand'
import { recordAudit } from '@/lib/compliance/audit'
import {
  collectPersonalData,
  PERSONAL_DATA_SOURCES,
  type PersonalDataReader,
} from '@/lib/compliance/gdpr'
import { routes } from '@/lib/routes'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Right of access and portability (art. 15 and 20 GDPR), required by §2 of the
 * brief "dès la Phase 1".
 *
 * Returns everything we hold about the caller, as one JSON file: structured,
 * commonly used, machine readable, which is what art. 20 asks for in those
 * words. No format negotiation, no partial exports — a subject access request
 * answered in pieces is answered badly.
 *
 * Two clients, on purpose:
 *   - the session client identifies the caller, through `getUser()` and never
 *     `getSession()`: a cookie is an assertion, `getUser()` is a verification,
 *     and here that difference decides whose data is handed over.
 *   - the service-role client reads. It has to: a member holds no SELECT policy
 *     on `audit_log`, so RLS alone cannot produce a complete export. Every
 *     query is then filtered on the id `getUser()` returned, in the one place
 *     that builds them (`collectPersonalData`).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: session, error: sessionError } = await supabase.auth.getUser()

  if (sessionError || !session.user) {
    return NextResponse.json(
      { error: 'unauthenticated', signIn: routes.signIn() },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const user = session.user
  const admin = createSupabaseAdminClient()

  let data
  try {
    data = await collectPersonalData(admin as unknown as PersonalDataReader, user.id)
  } catch (cause) {
    console.error('[gdpr/export] collection failed', cause)
    return NextResponse.json(
      { error: 'export_failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  /*
   * Logged, but never at the expense of the answer. A refused export is a
   * refused legal right; a missing log line is a gap in our own records. If one
   * of the two has to give, it is not the export.
   */
  try {
    await recordAudit(admin, {
      actorId: user.id,
      action: 'gdpr.export',
      entity: { schema: 'auth', table: 'users', id: user.id },
    })
  } catch (cause) {
    console.error('[gdpr/export] audit write failed', cause)
  }

  const generatedAt = new Date().toISOString()
  const filename = `${BRAND.slug}-donnees-${user.id}-${generatedAt.slice(0, 10)}.json`

  return NextResponse.json(
    {
      generatedAt,
      subject: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      },
      /* The inventory travels with the data so the file is self-describing:
         what was read, and what erasure would do to each part. */
      inventory: PERSONAL_DATA_SOURCES.map(({ key, schema, table, column, erasure }) => ({
        key,
        source: `${schema}.${table}.${column}`,
        erasure,
      })),
      data,
      privacyPolicy: routes.privacy(),
    },
    {
      status: 200,
      headers: {
        // Personal data. Not in a shared cache, not in the browser's, ever.
        'Cache-Control': 'no-store, private',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
