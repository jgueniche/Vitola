import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { recordAudit } from '@/lib/compliance/audit'
import { routes } from '@/lib/routes'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** Zod on every route handler, per §8 of the brief. */
const schema = z.object({
  /*
   * The caller's own handle, retyped. Not a checkbox: erasure is immediate and
   * irreversible, and the cost of a mistaken click is an account that cannot be
   * given back. Requiring a value only the account holder knows also means a
   * cross-origin POST cannot carry it.
   */
  confirm: z.string().min(1).max(30),
})

/**
 * Right to erasure (art. 17 GDPR), required by §2 of the brief "dès la Phase 1".
 *
 * POST, never GET: a URL that destroys an account on being fetched would be
 * destroyed by the first crawler, prefetch or link preview to touch it.
 *
 * What erasure actually does is decided by the foreign keys of migration 0001,
 * not by this handler, and that is deliberate — a cascade cannot be forgotten
 * the way a delete statement can:
 *
 *   - `profiles`, `profile_settings`, `consents` cascade. The personal data goes.
 *   - `audit_log.actor_id` and every `ref.*.created_by` / `verified_by` /
 *     `reviewed_by` are `set null`. The referential survives its contributor:
 *     an encyclopaedic fact is not personal data, its authorship is.
 *   - `ref.cigar_revisions.author_id` is NOT NULL, so it can only cascade. A
 *     departing contributor takes their revision proposals with them, including
 *     ones somebody else reviewed. That is a real hole in the wiki history and
 *     it is recorded, as a count, in the audit entry below. Changing it means a
 *     migration and a decision about what a revision is without its author.
 *
 * What the cascade does NOT reach: Storage. `deleteUser` removes rows, not
 * objects, and the `avatars` and `cigar-images` buckets are outside the
 * foreign-key graph entirely. Both hold zero objects today — checked on the
 * project, not assumed — so there is nothing to erase and no defect yet. There
 * will be one the day an avatar can be uploaded: whoever ships that upload
 * ships the matching `storage.remove()` here, in the same change. The path
 * convention does not exist yet, and erasing files by a guessed prefix is how
 * one deletes somebody else's.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: session, error: sessionError } = await supabase.auth.getUser()

  if (sessionError || !session.user) {
    return NextResponse.json(
      { error: 'unauthenticated', signIn: routes.signIn() },
      { status: 401, headers: NO_STORE },
    )
  }

  const user = session.user

  const body: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE })
  }

  // Read through the session client: `profiles_select_directory` already lets
  // anyone read their own row, so RLS is doing the scoping rather than a filter.
  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle()

  const expected = profile?.handle ?? user.id
  if (parsed.data.confirm.trim() !== expected) {
    return NextResponse.json({ error: 'confirmation_mismatch' }, { status: 409, headers: NO_STORE })
  }

  const admin = createSupabaseAdminClient()

  /*
   * Counted before the cascade takes them, because afterwards nothing can.
   *
   * The error is read, and that is the fix rather than a nicety. It used to be
   * discarded — and the service key turned out to hold no privilege at all on
   * `ref` until migration 0007, so this returned `undefined`, `?? 0` made it
   * zero, and the audit entry recorded "no revisions lost" for an erasure that
   * may well have destroyed some. A wrong number in an audit log is worse than
   * a missing one: it is read as a fact. An unknown count is now `null`, which
   * nobody can mistake for a measurement.
   */
  const { count, error: countError } = await admin
    .schema('ref')
    .from('cigar_revisions')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)

  if (countError) {
    console.error('[gdpr/delete] revision count failed, erasure proceeds unmeasured', countError)
  }
  const revisionsAuthored = countError ? null : (count ?? 0)

  /*
   * The trace is written first, and a failure to write it aborts the erasure.
   * An account erased without a record of the request being made is an account
   * we cannot prove we were asked to erase.
   *
   * `actor_id` will be set to NULL by the cascade a moment from now — that is
   * what makes `entity_id` the part that survives. It holds the id and nothing
   * else: no handle, no address. The id no longer resolves to a person once
   * `auth.users` is gone, which is the point. The count is kept because it
   * describes what the erasure cost the referential, not who asked for it.
   */
  try {
    await recordAudit(admin, {
      actorId: user.id,
      action: 'gdpr.erase',
      entity: { schema: 'auth', table: 'users', id: user.id },
      before: { revisionsAuthored },
    })
  } catch (cause) {
    console.error('[gdpr/delete] audit write failed, erasure aborted', cause)
    return NextResponse.json({ error: 'audit_failed' }, { status: 500, headers: NO_STORE })
  }

  const { error: eraseError } = await admin.auth.admin.deleteUser(user.id)
  if (eraseError) {
    console.error('[gdpr/delete] erasure failed', eraseError)
    return NextResponse.json({ error: 'erase_failed' }, { status: 500, headers: NO_STORE })
  }

  // Local scope: the tokens are already void server-side, and a round trip to
  // an auth server that no longer knows this user would only fail noisily.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)

  return NextResponse.json(
    { status: 'erased', revisionsDestroyed: revisionsAuthored },
    { status: 200, headers: NO_STORE },
  )
}
