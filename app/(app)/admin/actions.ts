'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { isKnownFlag, PAYLOAD_FIELDS } from '@/lib/admin/flags'
import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { clubSlug } from '@/lib/social/groups'
import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

/**
 * The writes of the admin area (ADR 0014).
 *
 * Only the flag goes through a door — `admin_set_flag`, because feature_flags
 * has no client write grant and the change must carry its audit_log trace in
 * the same transaction. Everything else writes through the caller's session,
 * under `cigars_update_editor`, `lines_*_editor` and `lines_delete_admin`:
 * this file never re-checks a role, and a member who forged their way to a
 * button writes zero rows — which every action below READS, because a policy
 * that declines does not raise (the /100 ↔ /20 lesson).
 *
 * Actions whose row survives return state (the flags). Actions that remove
 * their row from the list it was clicked in — reviewing a sheet under the
 * "non relues" filter, deleting a line — navigate, and the outcome travels in
 * the URL (`?fait=…`), because the form holding a returned state unmounts in
 * the same render (the /contributions rule).
 */

export type AdminState = { error?: string; done?: boolean }

const copy = m.admin.errors

/* -------------------------------------------------------------------------- */
/* Flags                                                                       */
/* -------------------------------------------------------------------------- */

const flagSchema = z.object({
  key: z.string().min(1),
  enabled: z.enum(['true', 'false']),
  hours: z.string().optional(),
  minRole: z.string().optional(),
})

export async function setFlag(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = flagSchema.safeParse({
    key: formData.get('key'),
    /* The « Enregistrer » submitter carries the current state as its own
       value, so saving a payload does not flip the flag. */
    enabled: formData.get('enabledOverride') ?? formData.get('enabled'),
    hours: formData.get('hours') ?? undefined,
    minRole: formData.get('minRole') ?? undefined,
  })
  if (!parsed.success) return { error: copy.unknown }

  const { key } = parsed.data
  /* The payload is built here, never forwarded raw: the screen only edits the
     one field a flag declares in PAYLOAD_FIELDS, and a flag without a declared
     shape keeps its stored payload untouched (the door coalesces on null). */
  let payload: { hours: number } | { min_role: string } | undefined
  if (isKnownFlag(key)) {
    const field = PAYLOAD_FIELDS[key]
    if (field?.kind === 'hours' && parsed.data.hours !== undefined && parsed.data.hours !== '') {
      const hours = Number.parseInt(parsed.data.hours, 10)
      if (!Number.isInteger(hours) || hours < field.min || hours > field.max) {
        return { error: copy.hoursRange }
      }
      payload = { hours }
    }
    if (field?.kind === 'role' && parsed.data.minRole) {
      if (!field.roles.includes(parsed.data.minRole)) return { error: copy.unknown }
      payload = { min_role: parsed.data.minRole }
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('admin_set_flag', {
    p_key: key,
    p_enabled: parsed.data.enabled === 'true',
    ...(payload !== undefined ? { p_payload: payload } : {}),
  })

  if (error) {
    if (error.code === '42501') return { error: copy.notAdmin }
    if (error.message.includes('VITOLA_FLAG_UNKNOWN')) return { error: copy.flagUnknown }
    return { error: copy.unknown }
  }

  revalidatePath(routes.adminFlags())
  revalidatePath(routes.admin())
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Sheets — review, unpublish, republish                                       */
/* -------------------------------------------------------------------------- */

const sheetSchema = z.object({
  id: z.uuid(),
  verb: z.enum(['relire', 'depublier', 'republier']),
  filtre: z.string().optional(),
  q: z.string().optional(),
})

const SHEET_OUTCOME: Record<z.infer<typeof sheetSchema>['verb'], string> = {
  relire: 'relue',
  depublier: 'depubliee',
  republier: 'republiee',
}

export async function actOnSheet(formData: FormData): Promise<void> {
  const parsed = sheetSchema.safeParse({
    id: formData.get('id'),
    verb: formData.get('verb'),
    filtre: formData.get('filtre') ?? undefined,
    q: formData.get('q') ?? undefined,
  })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return

  const ref = await referential()
  const patch =
    parsed.data.verb === 'relire'
      ? /* verified_at becomes a review timestamp — the meaning the column
           should always have had; until now it carried the publication date
           and verified_by was null on all 940 sheets (ADR 0014). */
        { verified_by: session.user.id, verified_at: new Date().toISOString() }
      : parsed.data.verb === 'depublier'
        ? { status: 'draft' as const }
        : { status: 'published' as const }

  const { data } = await ref.from('cigars').update(patch).eq('id', parsed.data.id).select('id')

  const params = new URLSearchParams()
  params.set('fait', data && data.length > 0 ? SHEET_OUTCOME[parsed.data.verb] : 'refus')
  if (parsed.data.filtre) params.set('filtre', parsed.data.filtre)
  if (parsed.data.q) params.set('q', parsed.data.q)

  revalidatePath(routes.adminSheets())
  redirect(`${routes.adminSheets()}?${params.toString()}`)
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

const createLineSchema = z.object({
  brandId: z.uuid(m.admin.errors.brandNeeded),
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, m.admin.errors.lineNameNeeded).max(120, m.admin.errors.tooLong)),
})

export async function createLine(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = createLineSchema.safeParse({
    brandId: formData.get('brandId'),
    name: formData.get('name'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? copy.unknown }

  const slug = clubSlug(parsed.data.name)
  if (slug === '') return { error: copy.lineNameNeeded }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAdmin }

  const ref = await referential()
  /* Born a draft by default (0019): publishing is the separate, visible
     gesture, even for the editor who just created it. */
  const { data, error } = await ref
    .from('lines')
    .insert({
      brand_id: parsed.data.brandId,
      name: parsed.data.name,
      slug,
      created_by: session.user.id,
    })
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: copy.lineExists }
    if (error.code === '42501') return { error: copy.notAdmin }
    return { error: copy.unknown }
  }
  if (!data || data.length === 0) return { error: copy.notAdmin }

  revalidatePath(routes.adminLines())
  revalidatePath(routes.admin())
  return { done: true }
}

const lineStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(['published', 'draft']),
})

export async function setLineStatus(formData: FormData): Promise<void> {
  const parsed = lineStatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const ref = await referential()
  const { data } = await ref
    .from('lines')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('id')

  const fait =
    !data || data.length === 0
      ? 'refus'
      : parsed.data.status === 'published'
        ? 'gamme-publiee'
        : 'gamme-depubliee'

  revalidatePath(routes.adminLines())
  redirect(`${routes.adminLines()}?fait=${fait}`)
}

export async function deleteLine(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const ref = await referential()
  const { data } = await ref.from('lines').delete().eq('id', parsed.data.id).select('id')

  revalidatePath(routes.adminLines())
  redirect(`${routes.adminLines()}?fait=${!data || data.length === 0 ? 'refus' : 'gamme-supprimee'}`)
}
