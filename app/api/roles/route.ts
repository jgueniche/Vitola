import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAudit } from '@/lib/compliance/audit'
import { GRANTABLE_ROLES } from '@/lib/settings/roles'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Granting and revoking a role — the debt named twice in the handoff.
 *
 * The §6 of the brief gives the wiki queue to `editor` and above. No account is
 * `editor`, `jeremy` is `admin` and therefore passes, and **no screen promotes
 * anybody** — so the queue has been reserved to a single person since P1, and
 * making a second reviewer meant an `update` by hand. That is fine for a closed
 * repository and an impasse on the day somebody contributes.
 *
 * It is a route and not a Server Action, and that is forced rather than chosen.
 * `profiles.role` is barred twice over: it appears in no `GRANT`, and
 * `tg_protect_profile_privileges` raises `42501` on any client write. Both
 * barriers are deliberate — migration 0009 exists because loosening one of them
 * was the tempting fix — so the write has to come from the service key, and
 * `lib/supabase/admin.ts` is confined by ESLint to `app/api/**`.
 *
 * Three decisions taken here, applied as documented defaults and reported:
 *
 *   - **Who promotes: an `admin`, and nobody else.** Not a moderator: hiding a
 *     comment and handing out rights are different powers, and the second one
 *     compounds. The check is `has_min_role('admin')` evaluated **under the
 *     caller's own session**, before the service key is touched at all.
 *   - **What may be granted: everything except `admin`.** Making another admin
 *     stays a database act. A screen that can mint the role that runs the
 *     screen has no floor.
 *   - **On what criterion: the admin's judgement.** No numeric threshold is
 *     invented here. The profile shows reputation and accepted revisions, which
 *     is what the judgement is made on; picking "50 points" in passing would be
 *     deciding a product rule nobody asked for.
 *
 * Every change is written to `audit_log`, before and after. A right granted
 * without a trace is a right nobody can audit — and unlike the export, this
 * caller does **not** swallow the audit failure: if the trace cannot be kept,
 * the grant does not happen.
 */

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

const bodySchema = z.object({
  userId: z.uuid(),
  role: z.enum(GRANTABLE_ROLES),
})

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  }

  /* Under the caller's session, so the answer is about them. `has_min_role` is
     SECURITY DEFINER and reads their own row; it cannot be spoofed by a body. */
  const { data: isAdmin, error: roleError } = await supabase.rpc('has_min_role', {
    minimum: 'admin',
  })
  if (roleError) {
    return NextResponse.json({ error: 'role_check_failed' }, { status: 500, headers: NO_STORE })
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE })
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE })
  }

  const admin = createSupabaseAdminClient()

  const { data: before, error: readError } = await admin
    .from('profiles')
    .select('id, handle, role')
    .eq('id', parsed.data.userId)
    .maybeSingle()

  if (readError) {
    return NextResponse.json({ error: 'read_failed' }, { status: 500, headers: NO_STORE })
  }
  if (!before) {
    return NextResponse.json({ error: 'no_such_member' }, { status: 404, headers: NO_STORE })
  }

  /* An admin's role is not editable from here either — in the other direction.
     Demoting the person who could re-promote you is the one move this screen
     must not offer, and `GRANTABLE_ROLES` only guards the target value. */
  if (before.role === 'admin') {
    return NextResponse.json({ error: 'admin_not_editable' }, { status: 403, headers: NO_STORE })
  }

  if (before.role === parsed.data.role) {
    return NextResponse.json({ ok: true, role: before.role, unchanged: true }, { headers: NO_STORE })
  }

  /* The trace first. If it cannot be written, the grant does not happen: a
     right handed out without a record is a right nobody can audit afterwards. */
  await recordAudit(admin, {
    actorId: auth.user.id,
    action: 'role.grant',
    entity: { schema: 'public', table: 'profiles', id: before.id },
    before: { role: before.role },
    after: { role: parsed.data.role },
  })

  const { data: after, error: writeError } = await admin
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.userId)
    .select('id, role')

  if (writeError) {
    return NextResponse.json({ error: 'write_failed' }, { status: 500, headers: NO_STORE })
  }
  /* Reading the result of a write, as the repository's own rule demands: the
     service key bypasses RLS, so a zero-row update here would mean the row went
     away between the read and the write — rare, and silent if unchecked. */
  if (!after || after.length === 0) {
    return NextResponse.json({ error: 'no_such_member' }, { status: 404, headers: NO_STORE })
  }

  return NextResponse.json({ ok: true, role: parsed.data.role }, { headers: NO_STORE })
}
