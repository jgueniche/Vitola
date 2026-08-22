import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/supabase/database.types'

/**
 * The writer for `public.audit_log`, named by that table's own comment:
 * "written exclusively by service-role code (lib/compliance/audit.ts) or
 * SECURITY DEFINER routines".
 *
 * Clients hold no INSERT grant and no INSERT policy on that table, so this only
 * works with the service-role client — which ESLint confines to `app/api/**`.
 * The client is a parameter rather than an import for that reason, and because
 * it keeps this module testable with a stub.
 *
 * `ip_hash` is deliberately never written here. The column exists for the day a
 * peppered hash is needed; storing one today would add a personal datum and a
 * mandatory secret in exchange for nothing we currently need. §2 asks for a
 * trace of who did what, not of where from.
 */
export type AuditEvent = {
  /** The acting user, or null for a system action. Under 80 characters. */
  actorId: string | null
  /** Dotted, stable, machine-readable: `gdpr.export`, `gdpr.erase`. */
  action: string
  entity?: {
    schema?: string
    table?: string
    /** Text, not uuid: the log outlives the rows it points at. */
    id?: string
  }
  before?: Json
  after?: Json
}

/**
 * Appends one entry. Throws if the write fails.
 *
 * Throwing is the point at the call sites that matter: an erasure whose trace
 * was not recorded must not proceed, because the trace is what proves the
 * erasure was asked for. A caller that would rather serve its response than
 * keep the trace — the export does — catches this deliberately.
 */
export async function recordAudit(
  admin: SupabaseClient<Database>,
  event: AuditEvent,
): Promise<void> {
  const { error } = await admin.from('audit_log').insert({
    actor_id: event.actorId,
    action: event.action,
    entity_schema: event.entity?.schema ?? null,
    entity_table: event.entity?.table ?? null,
    entity_id: event.entity?.id ?? null,
    before_state: event.before ?? null,
    after_state: event.after ?? null,
  })

  if (error) {
    throw new Error(`audit_log insert failed for "${event.action}": ${error.message}`)
  }
}
