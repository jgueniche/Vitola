import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { recordAudit } from '@/lib/compliance/audit'
import {
  DSA_SLA_HOURS,
  REPORTABLE,
  REPORTABLE_KINDS,
  REPORT_REASONS,
  type ReportableKind,
} from '@/lib/compliance/dsa'
import { routes } from '@/lib/routes'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** Zod on every route handler, per §8 of the brief. */
const schema = z.object({
  kind: z.enum(REPORTABLE_KINDS),
  id: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  /* The CHECK in migration 0004 caps this at 2000 characters. Stated here too
     so an over-long notice comes back as a 400 that names the field, rather
     than as a 500 carrying a constraint name. */
  detail: z.string().max(2000).optional(),
})

/**
 * The notice mechanism of art. 16 of the DSA.
 *
 * ADR 0005 made this a P1 obligation rather than a P3 one, and said why: the
 * comments hang off a cigar entry, an entry is readable by any visitor past the
 * age gate, so the first public user-generated content of the product arrives a
 * whole phase earlier than the Q12 default assumed. The queue and the deadline
 * shipped with migration 0004; this is the third of the three things the ADR
 * demands, and without it the other two describe a hole rather than close it.
 *
 * Two decisions worth reading before changing anything here.
 *
 * **The visibility check runs on the session client, not the service one.** It
 * asks "can this person see the thing they are reporting?", which is the only
 * question worth asking: a notice about a draft entry would confirm that the
 * draft exists, one 404 at a time. The service key would answer "does the row
 * exist", which is a different question and the wrong one. The service key is
 * used for exactly one statement — the RPC — and for the reason the migration
 * gives: `mod` is not exposed to PostgREST, and even `service_role` holds no
 * privilege there.
 *
 * **A session is required, and that is a real limitation.** Art. 16 wants a
 * mechanism that is easy to access; it does not require an account, and with
 * `public_signup_open` at false nobody can create one. The answer to that is
 * the point of contact in the legal notice, which is open to everyone and is
 * what art. 11 asks for — not weakening this endpoint. An anonymous POST here
 * would be a write into the moderation queue from the open internet, with no
 * rate limiter (Upstash lands in P4) and no way to come back to the notifier
 * with a decision, which art. 16(5) requires.
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

  const body: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE })
  }

  const { kind, id, reason, detail } = parsed.data
  if (!(await isVisibleToCaller(kind, id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const target = REPORTABLE[kind]
  const admin = createSupabaseAdminClient()

  const { data, error } = await admin.rpc('file_report', {
    p_reporter_id: session.user.id,
    p_entity_schema: target.schema,
    p_entity_table: target.table,
    p_entity_id: id,
    p_reason: reason,
    p_detail: detail ?? undefined,
  })

  if (error) {
    console.error('[signalements] file_report failed', error)
    return NextResponse.json({ error: 'report_failed' }, { status: 500, headers: NO_STORE })
  }

  const outcome = data as { status: string; id: string | null }

  if (outcome.status === 'duplicate') {
    return NextResponse.json(
      { status: 'duplicate', id: outcome.id },
      { status: 409, headers: NO_STORE },
    )
  }

  if (outcome.status === 'throttled') {
    return NextResponse.json({ status: 'throttled' }, { status: 429, headers: NO_STORE })
  }

  /*
   * The trace is written after the notice, not before, and its failure does not
   * undo it — the opposite of the erasure endpoint, and for the opposite
   * reason. There, the trace is what proves the irreversible act was asked for.
   * Here the notice IS a record: `mod.reports` already holds who, what, why and
   * when. The audit entry is a cross-cutting index over it, and losing an index
   * must never lose a report we are on a deadline to answer.
   *
   * `detail` is deliberately not copied here. It is free text about somebody
   * else, it is already stored once, and art. 5(1)(c) does not have an
   * exception for convenience.
   */
  try {
    await recordAudit(admin, {
      actorId: session.user.id,
      action: 'dsa.report',
      entity: { schema: target.schema, table: target.table, id },
      after: { reason, reportId: outcome.id },
    })
  } catch (cause) {
    console.error('[signalements] audit write failed, report kept', cause)
  }

  return NextResponse.json(
    { status: 'created', id: outcome.id, slaHours: DSA_SLA_HOURS },
    { status: 201, headers: NO_STORE },
  )
}

/**
 * Whether the caller can see what they are reporting.
 *
 * Reads through the session client on purpose, so RLS answers rather than a
 * filter written here. For a comment that means `comments_select_visible` —
 * published entry, not hidden — or `comments_select_own`, which is why an
 * author can still act on their own hidden comment. For an entry it means
 * `status = 'published'`, stated because the partial indexes only apply when
 * the predicate is.
 *
 * For a notebook entry it means the four SELECT policies of `reviews`, and no
 * `visibility` filter is written here — ADR 0004 forbids exactly that, and the
 * policies give the right answer anyway: an entry belonging to somebody else
 * and not shared with the reporter returns nothing, so the notice comes back
 * 404 and nothing is filed about a row the reporter could not have read.
 *
 * The `switch` is deliberate rather than a chain of `if`s falling through to
 * the referential. It was a chain, and adding `review` to `REPORTABLE` without
 * adding a branch here sent every entry notice to `ref.cigars` with a review's
 * id: 404 on a public entry the reporter was looking at. Exhaustive over the
 * union, so the next surface added to the map fails to compile instead.
 */
async function isVisibleToCaller(kind: ReportableKind, id: string): Promise<boolean> {
  switch (kind) {
    case 'comment': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('comments').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    case 'review': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('reviews').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    case 'cigar': {
      const db = await referential()
      const { data } = await db
        .from('cigars')
        .select('id')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle()
      return data !== null
    }

    /* The three surfaces P3 opened. Each is one `maybeSingle()` and no
       predicate: `posts` has five SELECT policies plus a RESTRICTIVE one for
       blocks, `post_comments` derives its audience from the publication by an
       EXISTS, and `profiles` honours `is_discoverable`. Writing any of that
       here would be the visibility filter ADR 0004 forbids, and it would be
       wrong within a phase — a policy changes, the copy in TypeScript does
       not. Someone reporting what they cannot read gets the same 404 as
       someone reporting what does not exist. */
    case 'post': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('posts').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    case 'postComment': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('post_comments').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    case 'profile': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    /* A private message, and the check is the same shape as all the others for
       a reason worth naming: `messages_select_own` joins the conversation, so
       only a participant reads one — which means only a participant can report
       one, and nobody can probe for a message by id. The surface is offered
       because art. 16 of the DSA does not stop at what is published, and
       ADR 0010 accepts the consequence out loud rather than implying an
       encryption this product does not have. */
    case 'message': {
      const supabase = await createSupabaseServerClient()
      const { data } = await supabase.from('messages').select('id').eq('id', id).maybeSingle()
      return data !== null
    }

    default: {
      // Adding a surface to REPORTABLE without a branch here stops compiling.
      const unhandled: never = kind
      throw new Error(`Unreportable kind reached the visibility check: ${String(unhandled)}`)
    }
  }
}
