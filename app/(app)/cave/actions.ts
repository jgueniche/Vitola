'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { refreshCigarStats } from '@/app/api/_stats/refresh'
import {
  HUMIDOR_LIMITS,
  OFFERED_EVENT_TYPES,
  consumesStock,
  parseCsv,
  type OfferedEventType,
} from '@/lib/humidor/model'
import { m } from '@/lib/i18n'
import { REVIEW_SCOPES, type ReviewVisibility } from '@/lib/reviews/model'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient, referential } from '@/lib/supabase/server'

/**
 * Every write of the humidor (migration 0008, ADR 0006).
 *
 * All of them go through the session client, so RLS decides and nothing here
 * restates a policy. Three rules in particular are the migration's and would be
 * wrong to copy:
 *
 *   - **whose cave it is** — one owner-only policy per table, reached by the
 *     three children through an `EXISTS`. No function in this file names a
 *     `user_id`, and none has to;
 *   - **what may be put away** — an `EXISTS` on `ref.cigars` inside the insert
 *     policy, itself under that table's RLS, so a draft cannot be shelved
 *     without this file knowing what a draft is;
 *   - **who may write `qty`** — nobody. It is absent from every UPDATE grant,
 *     and the only statement here that carries it is the one that *creates* a
 *     lot. That is ADR 0006 D3, and it is enforced by the grant rather than by
 *     anyone remembering it.
 *
 * The one place two tables are written together is `smokeFromLot`, and it does
 * not do the writing: `public.smoke_from_humidor()` does, in one transaction,
 * in caller's rights. This file could not have made that atomic and did not try.
 */

export type HumidorState = { error?: string; done?: boolean; id?: string }

/* -------------------------------------------------------------------------- */
/* Shared field schemas                                                        */
/* -------------------------------------------------------------------------- */

const copy = m.humidor.errors

const blank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

const optionalText = (max: number, message: string) =>
  z.preprocess(
    blank,
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(max, message))
      .nullable(),
  )

const optionalNumber = (min: number, max: number, message: string) =>
  z.preprocess(blank, z.coerce.number().min(min, message).max(max, message).nullable())

const optionalInteger = (min: number, max: number, message: string) =>
  z.preprocess(blank, z.coerce.number().int(message).min(min, message).max(max, message).nullable())

/**
 * A day, never in the future — with the same day of slack as the notebook, and
 * for the same reason: a member filling this in on their Tuesday evening in
 * Auckland is on the server's Monday, and refusing them would be reported as
 * "it will not accept today".
 */
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, copy.dateInvalid)
  .refine((value) => !Number.isNaN(Date.parse(value)), copy.dateInvalid)
  .refine((value) => {
    const limit = new Date()
    limit.setUTCDate(limit.getUTCDate() + 1)
    return Date.parse(value) <= limit.getTime()
  }, copy.dateFuture)

const optionalDay = z.preprocess(blank, daySchema.nullable())

/* -------------------------------------------------------------------------- */
/* The caves themselves                                                        */
/* -------------------------------------------------------------------------- */

const humidorSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, copy.nameRequired).max(HUMIDOR_LIMITS.nameMax, copy.nameTooLong)),
  capacity: optionalInteger(HUMIDOR_LIMITS.capacityMin, HUMIDOR_LIMITS.capacityMax, copy.capacityRange),
  targetRh: optionalNumber(HUMIDOR_LIMITS.rhMin, HUMIDOR_LIMITS.rhMax, copy.rhRange),
  targetTemp: optionalNumber(HUMIDOR_LIMITS.tempMin, HUMIDOR_LIMITS.tempMax, copy.tempRange),
  isDefault: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
})

/**
 * Creates a cave.
 *
 * The first one is always the default one, whatever the box was ticked to: a
 * member with a single humidor and no default would be offered a choice with
 * one option every time they put something away. Beyond the first, ticking it
 * has to *un*-tick the previous — `humidors_one_default_idx` is a unique
 * partial index, so the second default is a 23505 rather than a silent second
 * truth.
 */
export async function createHumidor(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = humidorSchema.safeParse({
    name: formData.get('name'),
    capacity: formData.get('capacity'),
    targetRh: formData.get('targetRh'),
    targetTemp: formData.get('targetTemp'),
    isDefault: formData.get('isDefault'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { count } = await supabase.from('humidors').select('id', { count: 'exact', head: true })
  const first = (count ?? 0) === 0
  const wantsDefault = first || parsed.data.isDefault

  if (wantsDefault && !first) await clearDefault()

  const { data, error } = await supabase
    .from('humidors')
    .insert({
      user_id: session.user.id,
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      target_rh: parsed.data.targetRh,
      target_temp: parsed.data.targetTemp,
      is_default: wantsDefault,
    })
    .select('id')
    .single()

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidor())
  return { done: true, id: data.id }
}

export async function updateHumidor(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = humidorSchema.extend({ id: z.uuid() }).safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    capacity: formData.get('capacity'),
    targetRh: formData.get('targetRh'),
    targetTemp: formData.get('targetTemp'),
    isDefault: formData.get('isDefault'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  if (parsed.data.isDefault) await clearDefault(parsed.data.id)

  const { data, error } = await supabase
    .from('humidors')
    .update({
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      target_rh: parsed.data.targetRh,
      target_temp: parsed.data.targetTemp,
      is_default: parsed.data.isDefault,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  /* An UPDATE a policy refuses matches no row and reports nothing. Reading the
     result is the only way to tell "saved" from "declined" — the trap that kept
     the /100 ↔ /20 toggle silently doing nothing for a whole day. */
  if (!data || data.length === 0) return { error: copy.notAllowed }

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(parsed.data.id))
  return { done: true, id: parsed.data.id }
}

/**
 * Deletes a cave, and everything in it — lots, ledger and readings all cascade.
 *
 * The notebook entries written from it survive: `humidor_events.review_id` is
 * the reference, and it points the other way. Emptying a cave does not unsay
 * what one thought of a cigar.
 */
export async function deleteHumidor(formData: FormData): Promise<void> {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('humidors').delete().eq('id', parsed.data.id)

  revalidatePath(routes.humidor())
  redirect(routes.humidor())
}

/** Steps the current default aside so the unique partial index stays satisfied. */
async function clearDefault(except?: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  let query = supabase.from('humidors').update({ is_default: false }).eq('is_default', true)
  if (except) query = query.neq('id', except)
  await query
}

/* -------------------------------------------------------------------------- */
/* Putting cigars away                                                         */
/* -------------------------------------------------------------------------- */

const lotSchema = z.object({
  humidorId: z.uuid(),
  cigarId: z.uuid(),
  qty: z.coerce
    .number()
    .int(copy.qtyRange)
    .min(HUMIDOR_LIMITS.qtyMin, copy.qtyRange)
    .max(HUMIDOR_LIMITS.qtyMax, copy.qtyRange),
  purchaseDate: optionalDay,
  price: optionalNumber(HUMIDOR_LIMITS.priceMin, HUMIDOR_LIMITS.priceMax, copy.priceRange),
  vendorName: optionalText(HUMIDOR_LIMITS.vendorMax, copy.vendorTooLong),
  boxCode: optionalText(HUMIDOR_LIMITS.boxCodeMax, copy.boxCodeTooLong),
  position: optionalText(HUMIDOR_LIMITS.positionMax, copy.positionTooLong),
  agingStartDate: optionalDay,
  notes: optionalText(HUMIDOR_LIMITS.notesMax, copy.notesTooLong),
})

/**
 * Creates a lot, with its opening balance.
 *
 * One statement, and that is the design: the `after insert` trigger of 0008
 * writes the matching `add` event in the same transaction, so the ledger is
 * complete from the first line without this file making a second call it could
 * fail halfway through (ADR 0006, D3).
 *
 * Adding five of a cigar one already has makes a *second* lot rather than
 * topping up the first. Two purchases have two ages and two prices, and §5.5
 * asks for the ageing — merging them would average a maturity nobody matured.
 */
export async function addLot(_previous: HumidorState, formData: FormData): Promise<HumidorState> {
  const parsed = lotSchema.safeParse({
    humidorId: formData.get('humidorId'),
    cigarId: formData.get('cigarId'),
    qty: formData.get('qty'),
    purchaseDate: formData.get('purchaseDate'),
    price: formData.get('price'),
    vendorName: formData.get('vendorName'),
    boxCode: formData.get('boxCode'),
    position: formData.get('position'),
    agingStartDate: formData.get('agingStartDate'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_items')
    .insert({
      humidor_id: parsed.data.humidorId,
      cigar_id: parsed.data.cigarId,
      qty: parsed.data.qty,
      purchase_date: parsed.data.purchaseDate,
      purchase_price_eur: parsed.data.price,
      vendor_name: parsed.data.vendorName,
      box_code: parsed.data.boxCode,
      position: parsed.data.position,
      aging_start_date: parsed.data.agingStartDate,
      notes: parsed.data.notes,
    })
    .select('id')
    .single()

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
  return { done: true, id: data.id }
}

/** Moves a lot to another cave. The `move` line in the ledger is a trigger's. */
export async function moveLot(_previous: HumidorState, formData: FormData): Promise<HumidorState> {
  const parsed = z
    .object({ itemId: z.uuid(), humidorId: z.uuid() })
    .safeParse({ itemId: formData.get('itemId'), humidorId: formData.get('humidorId') })
  if (!parsed.success) return { error: copy.unknown }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('humidor_items')
    .update({ humidor_id: parsed.data.humidorId })
    .eq('id', parsed.data.itemId)
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  if (!data || data.length === 0) return { error: copy.notAllowed }

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
  return { done: true, id: parsed.data.itemId }
}

export async function deleteLot(formData: FormData): Promise<void> {
  const parsed = z
    .object({ itemId: z.uuid(), humidorId: z.uuid() })
    .safeParse({ itemId: formData.get('itemId'), humidorId: formData.get('humidorId') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('humidor_items').delete().eq('id', parsed.data.itemId)

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
}

/* -------------------------------------------------------------------------- */
/* Taking cigars out — the gesture P2's exit criterion is about                 */
/* -------------------------------------------------------------------------- */

const smokeSchema = z.object({
  itemId: z.uuid(),
  qty: z.coerce.number().int(copy.qtyRange).min(1, copy.qtyRange).max(HUMIDOR_LIMITS.qtyMax, copy.qtyRange),
  occurredOn: daySchema,
  visibility: z.enum(REVIEW_SCOPES),
  score: optionalNumber(0, 100, copy.scoreRange),
  body: optionalText(4000, copy.bodyTooLong),
  slug: z.string().min(1).optional(),
})

/**
 * Smokes from a lot: the notebook entry and the `smoke` event, together.
 *
 * The two writes are one call because `public.smoke_from_humidor()` performs
 * both in a single transaction (ADR 0006, D1). It is SECURITY INVOKER, so it
 * writes nothing this member could not write by hand, and the refusals below
 * are the database's own — a lot that is not theirs is *not found*, never
 * *forbidden*, because "forbidden" would confirm that it exists.
 *
 * The returned id is the entry's, or null when nothing was noted. Null is a
 * success: the ledger event is the record then, and an empty notebook line
 * would be a date with no sentence.
 */
export async function smokeFromLot(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = smokeSchema.safeParse({
    itemId: formData.get('itemId'),
    qty: formData.get('qty') ?? '1',
    occurredOn: formData.get('occurredOn'),
    visibility: formData.get('visibility'),
    score: formData.get('score'),
    body: formData.get('body'),
    slug: formData.get('slug') ?? undefined,
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('smoke_from_humidor', {
    p_item_id: parsed.data.itemId,
    p_qty: parsed.data.qty,
    p_smoked_on: parsed.data.occurredOn,
    p_visibility: parsed.data.visibility,
    p_score: parsed.data.score,
    p_body: parsed.data.body,
  })

  if (error) return { error: smokeRefusal(error.code, error.message) }

  await settleSmoke(parsed.data.visibility, parsed.data.slug ?? null)
  return { done: true, id: data ?? undefined }
}

const eventSchema = z.object({
  itemId: z.uuid(),
  humidorId: z.uuid(),
  type: z.enum(OFFERED_EVENT_TYPES),
  qty: z.coerce.number().int(copy.qtyRange).min(-HUMIDOR_LIMITS.qtyMax).max(HUMIDOR_LIMITS.qtyMax),
  occurredOn: daySchema,
})

/**
 * The three movements that are not smoking, plus the correction.
 *
 * `smoke` is refused here even though the enum offers it: it belongs to
 * `smokeFromLot` above, which alone can pair it with a notebook entry. A second
 * way to record a smoke would be a second way to lose the link that P2's exit
 * criterion is about.
 *
 * `adjust` is the only signed one. It is how a member says "I counted two
 * fewer" without erasing anything — the ledger has no UPDATE and no DELETE
 * grant, so a miscount is corrected forwards or not at all.
 */
export async function recordEvent(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = eventSchema.safeParse({
    itemId: formData.get('itemId'),
    humidorId: formData.get('humidorId'),
    type: formData.get('type'),
    qty: formData.get('qty'),
    occurredOn: formData.get('occurredOn'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const type = parsed.data.type as OfferedEventType
  const qty = type === 'adjust' ? parsed.data.qty : Math.abs(parsed.data.qty)

  if (qty === 0) return { error: copy.qtyRange }
  if (type !== 'adjust' && qty < 1) return { error: copy.qtyRange }

  if (consumesStock(type)) {
    const left = await stockOf(parsed.data.itemId)
    if (left === null) return { error: copy.lotNotFound }
    if (left < qty) return { error: copy.notEnoughStock.replace('{count}', String(left)) }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('humidor_events').insert({
    item_id: parsed.data.itemId,
    type,
    qty,
    occurred_at: parsed.data.occurredOn,
  })

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
  return { done: true, id: parsed.data.itemId }
}

/**
 * Records the `smoke` event for a tasting that was saved without one.
 *
 * This is the second half of the two-write path ADR 0006 D1 accepts for the
 * structured tasting, and the reason that path is acceptable: the gap is
 * visible on the entry, and closing it is one atomic call. The entry already
 * exists, so the function is not used — it would write a second one.
 */
export async function attachSmokeToEntry(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = z
    .object({ itemId: z.uuid(), reviewId: z.uuid(), qty: z.coerce.number().int().min(1).max(100) })
    .safeParse({
      itemId: formData.get('itemId'),
      reviewId: formData.get('reviewId'),
      qty: formData.get('qty') ?? '1',
    })
  if (!parsed.success) return { error: copy.unknown }

  const left = await stockOf(parsed.data.itemId)
  if (left === null) return { error: copy.lotNotFound }
  if (left < parsed.data.qty) {
    return { error: copy.notEnoughStock.replace('{count}', String(left)) }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('humidor_events').insert({
    item_id: parsed.data.itemId,
    type: 'smoke',
    qty: parsed.data.qty,
    review_id: parsed.data.reviewId,
  })

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidor())
  revalidatePath(routes.notebookEntry(parsed.data.reviewId))
  return { done: true, id: parsed.data.reviewId }
}

/* -------------------------------------------------------------------------- */
/* Hygrometry                                                                  */
/* -------------------------------------------------------------------------- */

const readingSchema = z
  .object({
    humidorId: z.uuid(),
    rh: optionalNumber(HUMIDOR_LIMITS.rhMin, HUMIDOR_LIMITS.rhMax, copy.rhRange),
    tempC: optionalNumber(HUMIDOR_LIMITS.tempMin, HUMIDOR_LIMITS.tempMax, copy.tempRange),
  })
  /* `humidor_readings_says_something`, restated so the refusal is a sentence
     rather than a 23514 nobody can read. */
  .refine((value) => value.rh !== null || value.tempC !== null, {
    message: copy.emptyReading,
    path: ['rh'],
  })

export async function addReading(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const parsed = readingSchema.safeParse({
    humidorId: formData.get('humidorId'),
    rh: formData.get('rh'),
    tempC: formData.get('tempC'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  /* `source` is left to its default. v1 has no door for a device, and writing
     'manual' by hand here would make it look like a choice. */
  const { error } = await supabase.from('humidor_readings').insert({
    humidor_id: parsed.data.humidorId,
    rh: parsed.data.rh,
    temp_c: parsed.data.tempC,
  })

  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
  return { done: true, id: parsed.data.humidorId }
}

export async function deleteReading(formData: FormData): Promise<void> {
  const parsed = z
    .object({ id: z.uuid(), humidorId: z.uuid() })
    .safeParse({ id: formData.get('id'), humidorId: formData.get('humidorId') })
  if (!parsed.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('humidor_readings').delete().eq('id', parsed.data.id)

  revalidatePath(routes.humidorDetail(parsed.data.humidorId))
}

/* -------------------------------------------------------------------------- */
/* CSV import — the export is a route handler, because it returns a file        */
/* -------------------------------------------------------------------------- */

const MAX_IMPORT_ROWS = 500

/**
 * Reads an inventory file into lots.
 *
 * Everything is resolved before anything is written: unknown slugs are named
 * back in full rather than skipped. An import that silently drops four lines
 * out of forty is the worst possible outcome — the file looks imported and the
 * cave is wrong by an amount nobody can see.
 *
 * The insert is one statement for all rows, so a refusal leaves nothing behind.
 * That is not a transaction we arranged; it is one `insert` with many values,
 * which PostgREST runs as one.
 */
export async function importCsv(
  _previous: HumidorState,
  formData: FormData,
): Promise<HumidorState> {
  const humidorId = z.uuid().safeParse(formData.get('humidorId'))
  if (!humidorId.success) return { error: copy.unknown }

  const file = formData.get('file')
  const text = typeof file === 'string' ? file : file instanceof File ? await file.text() : ''
  if (text.trim() === '') return { error: copy.csvEmpty }

  const parsed = parseCsv(text)
  if (parsed.error === 'header') return { error: copy.csvHeader }
  if (parsed.error === 'empty' || parsed.rows.length === 0) return { error: copy.csvEmpty }
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return { error: copy.csvTooLong.replace('{max}', String(MAX_IMPORT_ROWS)) }
  }

  const slugs = [...new Set(parsed.rows.map((row) => (row.cigar_slug ?? '').trim()).filter(Boolean))]
  if (slugs.length === 0) return { error: copy.csvHeader }

  const db = await referential()
  const { data: cigars } = await db.from('cigars').select('id, slug').in('slug', slugs)
  const bySlug = new Map((cigars ?? []).map((cigar) => [cigar.slug, cigar.id]))

  const unknown = slugs.filter((slug) => !bySlug.has(slug))
  if (unknown.length > 0) {
    return { error: copy.csvUnknownSlug.replace('{slugs}', unknown.slice(0, 5).join(', ')) }
  }

  const rows = []
  for (const [index, row] of parsed.rows.entries()) {
    const line = index + 2 // the header is line 1, and a person counts from 1
    const qty = Number.parseInt((row.qty ?? '').trim(), 10)
    if (!Number.isInteger(qty) || qty < HUMIDOR_LIMITS.qtyMin || qty > HUMIDOR_LIMITS.qtyMax) {
      return { error: copy.csvBadQty.replace('{line}', String(line)) }
    }

    const price = (row.purchase_price_eur ?? '').trim()
    rows.push({
      humidor_id: humidorId.data,
      cigar_id: bySlug.get((row.cigar_slug ?? '').trim())!,
      qty,
      purchase_date: emptyToNull(row.purchase_date),
      purchase_price_eur: price === '' ? null : Number.parseFloat(price.replace(',', '.')),
      currency: (row.currency ?? '').trim() || 'EUR',
      vendor_name: emptyToNull(row.vendor_name),
      box_code: emptyToNull(row.box_code),
      position: emptyToNull(row.position),
      aging_start_date: emptyToNull(row.aging_start_date),
      notes: emptyToNull(row.notes),
    })
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('humidor_items').insert(rows)
  if (error) return { error: refusalMessage(error.code) }

  revalidatePath(routes.humidor())
  revalidatePath(routes.humidorDetail(humidorId.data))
  return { done: true, id: humidorId.data }
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                    */
/* -------------------------------------------------------------------------- */

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** What a lot holds, or null when it is not this member's to hold. */
async function stockOf(itemId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('humidor_items')
    .select('qty')
    .eq('id', itemId)
    .maybeSingle()
  return data?.qty ?? null
}

/**
 * After a smoke: re-render, and refresh the public average when the entry that
 * was just written is one that counts towards it.
 *
 * Only `public` can move it (ADR 0004, D3), and a smoke only ever *creates* an
 * entry — never re-scopes one — so unlike the notebook's `settle()` there is no
 * "before" to consider here.
 */
async function settleSmoke(visibility: ReviewVisibility, slug: string | null): Promise<void> {
  if (visibility === 'public') await refreshCigarStats()
  if (slug) revalidatePath(routes.cigar(slug))
  revalidatePath(routes.humidor())
  revalidatePath(routes.notebook())
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.unknown
}

function refusalMessage(code: string | undefined): string {
  if (code === '42501') return copy.notAllowed
  if (code === '23505') return copy.alreadyDefault
  return copy.unknown
}

/**
 * The three refusals `smoke_from_humidor()` raises, told apart.
 *
 * `P0002` is the important one: the lot was not found *under this member's
 * RLS*, which covers both "no such lot" and "not yours" — and says the same
 * thing for both, on purpose. The stock message carries the count, because
 * "il n'en reste que 2" is actionable where "refusé" is not.
 */
function smokeRefusal(code: string | undefined, message: string): string {
  if (code === 'P0002') return copy.lotNotFound
  if (code === '23514') {
    const left = /only (-?\d+) left/.exec(message)?.[1]
    return left ? copy.notEnoughStock.replace('{count}', left) : copy.unknown
  }
  if (code === '22023') return copy.qtyRange
  if (code === '42501') return copy.notAllowed
  return copy.unknown
}
