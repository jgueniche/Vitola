'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { MOD_DONE, MOD_LIMITS } from '@/lib/moderation/model'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Every write of the moderation desk (ADR 0013).
 *
 * Both actions call a SECURITY DEFINER door of migration 0018 and restate
 * nothing the door decides: who may act (`has_min_role('moderator')` inside),
 * which verbs are armed, which surfaces can be hidden, that a decided case
 * stays decided. What is restated is shape — the note is required and bounded —
 * because a thrown `VITOLA_NOTE_REQUIRED` is not a sentence for anyone.
 *
 * The door raises instead of returning zero rows, so unlike PostgREST table
 * writes the failure mode here is an error, not silence — it still gets read,
 * mapped to copy, and rendered in place.
 */

export type DecideFormState = { error?: string }

const errors = m.moderation.desk.errors

const decideSchema = z.object({
  report: z.string().uuid(),
  decision: z.enum(['upheld', 'dismissed']),
  note: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z.string().min(1, errors.noteRequired).max(MOD_LIMITS.note, errors.noteRequired),
    ),
  verb: z.enum(['none', 'hide', 'restore']),
  actReason: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(MOD_LIMITS.actReason))
    .transform((value) => (value.length > 0 ? value : null)),
})

/** The database's refusals, translated. Anything unrecognised stays generic —
 *  the real message went to the server log, not to the screen. */
function decideErrorCopy(message: string): string {
  if (message.includes('VITOLA_NOTE_REQUIRED')) return errors.noteRequired
  if (message.includes('VITOLA_ACT_REASON_REQUIRED')) return errors.actReasonRequired
  if (message.includes('VITOLA_REPORT_ALREADY_DECIDED')) return errors.alreadyDecided
  if (message.includes('VITOLA_TARGET_GONE')) return errors.targetGone
  if (message.includes('VITOLA_TARGET_NOT_HIDEABLE')) return errors.notHideable
  return errors.generic
}

export async function acknowledgeReport(formData: FormData): Promise<void> {
  const id = z.string().uuid().parse(formData.get('report'))

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('mod_acknowledge', { p_id: id })
  if (error) throw new Error(`mod_acknowledge: ${error.message}`)

  revalidatePath(routes.moderation())
  redirect(`${routes.moderationReport(id)}?fait=${MOD_DONE.acknowledged}`)
}

export async function decideReport(
  _previous: DecideFormState,
  formData: FormData,
): Promise<DecideFormState> {
  const parsed = decideSchema.safeParse({
    report: formData.get('report'),
    decision: formData.get('decision'),
    note: formData.get('note'),
    verb: formData.get('verb') ?? 'none',
    actReason: formData.get('actReason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? errors.generic }
  }

  const { report, decision, note, verb, actReason } = parsed.data

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('mod_decide', {
    p_report: report,
    p_decision: decision,
    p_note: note,
    ...(verb === 'none' ? {} : { p_verb: verb }),
    ...(actReason === null ? {} : { p_act_reason: actReason }),
  })
  if (error) return { error: decideErrorCopy(error.message) }

  // Read the result of a write, always — a door that returned nothing decided
  // nothing, whatever the absence of error suggests.
  const status = (data as { status?: string } | null)?.status
  if (status !== decision) return { error: errors.generic }

  revalidatePath(routes.moderation())
  redirect(`${routes.moderation()}?fait=${MOD_DONE.decided}`)
}
