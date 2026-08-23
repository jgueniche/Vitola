'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  HOURS_DAYS,
  isVenueType,
  VENUE_DONE,
  VENUE_LIMITS,
  VENUE_REVIEW_LIMITS,
  venueSlug,
  type VenueHours,
} from '@/lib/venues/model'

/**
 * Every write on the venue directory (ADR 0011).
 *
 * All of them go through the session client and none restates a policy. What
 * migration 0016 decides and this file never repeats:
 *
 *   - **A proposal is born pending** — `status` is not even in the INSERT
 *     grant; the default writes it.
 *   - **Who publishes** — an editor, by `venues_update_editor`. The author's
 *     own UPDATE carries a WITH CHECK that keeps the row pending.
 *   - **Whose review it is** — `user_id = auth.uid()`, on a published venue.
 *   - **The mean** — `rating` is GENERATED. This file could not write it if it
 *     tried, and that is the §2 guardrail working.
 *
 * What is restated is shape — bounds and the slug — pinned by
 * `tests/unit/venues-model.test.ts` against the migration.
 */

export type VenueFormState = { error?: string }

const propose = m.venues.propose
const reviews = m.venues.reviews

function firstMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}

const optionalTrimmed = (max: number, message: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max, message))
    .transform((value) => (value.length > 0 ? value : null))

const proposeSchema = z.object({
  type: z.string().refine(isVenueType, propose.typeInvalid),
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(VENUE_LIMITS.nameMin, propose.nameTooShort.replace('{min}', String(VENUE_LIMITS.nameMin)))
        .max(VENUE_LIMITS.nameMax, propose.nameTooLong.replace('{max}', String(VENUE_LIMITS.nameMax))),
    ),
  city: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(VENUE_LIMITS.cityMin, propose.cityMissing)
        .max(VENUE_LIMITS.cityMax, propose.cityTooLong.replace('{max}', String(VENUE_LIMITS.cityMax))),
    ),
  address: optionalTrimmed(
    VENUE_LIMITS.addressMax,
    propose.addressTooLong.replace('{max}', String(VENUE_LIMITS.addressMax)),
  ),
  postalCode: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().regex(/^$|^[0-9A-Za-z][0-9A-Za-z -]{1,9}$/, propose.postalInvalid))
    .transform((value) => (value.length > 0 ? value : null)),
  phone: optionalTrimmed(
    VENUE_LIMITS.phoneMax,
    propose.phoneTooLong.replace('{max}', String(VENUE_LIMITS.phoneMax)),
  ),
  website: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().regex(/^$|^https?:\/\/.{1,190}$/, propose.websiteInvalid))
    .transform((value) => (value.length > 0 ? value : null)),
  smoking: z.enum(['yes', 'no', 'unknown']),
  ventilated: z.enum(['yes', 'no', 'unknown']),
  /* Both or neither — half a coordinate is not a place on Earth. */
  lat: z.string().transform((value) => value.trim()),
  lng: z.string().transform((value) => value.trim()),
})

function triState(value: 'yes' | 'no' | 'unknown'): boolean | null {
  return value === 'unknown' ? null : value === 'yes'
}

export async function proposeVenue(
  _previous: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const parsed = proposeSchema.safeParse({
    type: formData.get('type') ?? '',
    name: formData.get('name') ?? '',
    city: formData.get('city') ?? '',
    address: formData.get('address') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    phone: formData.get('phone') ?? '',
    website: formData.get('website') ?? '',
    smoking: formData.get('smoking') ?? 'unknown',
    ventilated: formData.get('ventilated') ?? 'unknown',
    lat: formData.get('lat') ?? '',
    lng: formData.get('lng') ?? '',
  })
  if (!parsed.success) return { error: firstMessage(parsed.error, propose.refused) }

  const hours: VenueHours = {}
  for (const day of HOURS_DAYS) {
    const raw = formData.get(`hours-${day}`)
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (value.length === 0) continue
    if (value.length > VENUE_LIMITS.hoursDayMax) {
      return { error: propose.hoursDayTooLong.replace('{max}', String(VENUE_LIMITS.hoursDayMax)) }
    }
    hours[day] = value
  }

  /* The coordinates, when given: both, on Earth, and written as EWKT — the
     text form a geography column reads. Half a pair is refused rather than
     guessed at. */
  let geo: string | null = null
  if (parsed.data.lat.length > 0 || parsed.data.lng.length > 0) {
    const lat = Number(parsed.data.lat.replace(',', '.'))
    const lng = Number(parsed.data.lng.replace(',', '.'))
    const onEarth =
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    if (!onEarth) return { error: propose.positionInvalid }
    geo = `SRID=4326;POINT(${lng} ${lat})`
  }

  const base = venueSlug(parsed.data.name, parsed.data.city)
  if (base.length === 0) return { error: propose.slugEmpty }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: propose.signedOut }

  /* The slug is unique across the directory, and every third civette is « Le
     Balto » : on collision, retry with a numeric suffix — the seed's own rule.
     Five tries, then the last error speaks. */
  let slug = base
  for (let attempt = 2; attempt <= 6; attempt += 1) {
    const { data, error } = await supabase
      .from('venues')
      .insert({
        type: parsed.data.type,
        name: parsed.data.name,
        slug,
        address: parsed.data.address,
        city: parsed.data.city,
        postal_code: parsed.data.postalCode,
        phone: parsed.data.phone,
        website: parsed.data.website,
        hours,
        has_smoking_room: triState(parsed.data.smoking),
        is_ventilated: triState(parsed.data.ventilated),
        geo,
        created_by: auth.user.id,
      })
      .select('slug')
      .single()

    if (data) {
      revalidatePath(routes.venues())
      redirect(`${routes.venue(data.slug)}?fait=${VENUE_DONE.proposed}`)
    }
    if (error?.code === '23505') {
      slug = `${base}-${attempt}`
      continue
    }
    return { error: error?.code === '42501' ? propose.refused : (error?.message ?? propose.refused) }
  }
  return { error: propose.refused }
}

/**
 * Publishing, closing, withdrawing — the three status gestures. All three
 * **navigate**: publishing replaces the pending banner under the very button
 * that ran it, withdrawing removes the page. And all three **read the result
 * of the write**: a policy that refuses returns zero rows, and « Lieu publié »
 * over nothing is the failure that rule exists for.
 */
export async function publishVenue(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('venueId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!id.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('venues')
    .update({ status: 'published' })
    .eq('id', id.data)
    .select('id')
    .maybeSingle()

  revalidatePath(routes.venues())
  revalidatePath(routes.venue(slug.data))
  redirect(
    data ? `${routes.venue(slug.data)}?fait=${VENUE_DONE.published}` : routes.venue(slug.data),
  )
}

export async function closeVenue(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('venueId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!id.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('venues')
    .update({ status: 'closed' })
    .eq('id', id.data)
    .select('id')
    .maybeSingle()

  revalidatePath(routes.venues())
  revalidatePath(routes.venue(slug.data))
  redirect(data ? `${routes.venue(slug.data)}?fait=${VENUE_DONE.closed}` : routes.venue(slug.data))
}

export async function withdrawVenue(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get('venueId'))
  if (!id.success) return

  const supabase = await createSupabaseServerClient()
  await supabase.from('venues').delete().eq('id', id.data)

  revalidatePath(routes.venues())
  redirect(`${routes.venues()}?fait=${VENUE_DONE.withdrawn}`)
}

/**
 * One review per member and per venue, saved as **update then insert** — never
 * an upsert. The lesson is `event_attendees`, written in supabase/CLAUDE.md: a
 * PostgREST upsert writes every column of its payload in the DO UPDATE, so it
 * demands UPDATE on `venue_id` and `user_id`, which nothing grants — `42501`,
 * silently, and the screen repaints over nothing.
 */
export async function saveVenueReview(
  _previous: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const criterion = z.coerce
    .number()
    .int()
    .min(VENUE_REVIEW_LIMITS.criterionMin, reviews.criterionMissing)
    .max(VENUE_REVIEW_LIMITS.criterionMax, reviews.criterionMissing)

  const parsed = z
    .object({
      venueId: z.uuid(),
      slug: z.string().min(1),
      welcome: criterion,
      comfort: criterion,
      advice: criterion,
      body: optionalTrimmed(
        VENUE_REVIEW_LIMITS.bodyMax,
        reviews.bodyTooLong.replace('{max}', String(VENUE_REVIEW_LIMITS.bodyMax)),
      ),
    })
    .safeParse({
      venueId: formData.get('venueId'),
      slug: formData.get('slug'),
      welcome: formData.get('welcome') ?? 0,
      comfort: formData.get('comfort') ?? 0,
      advice: formData.get('advice') ?? 0,
      body: formData.get('body') ?? '',
    })
  if (!parsed.success) return { error: firstMessage(parsed.error, reviews.refused) }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: reviews.signedOut }

  const payload = {
    welcome: parsed.data.welcome,
    comfort: parsed.data.comfort,
    advice: parsed.data.advice,
    body: parsed.data.body,
  }

  const { data: updated, error: updateError } = await supabase
    .from('venue_reviews')
    .update(payload)
    .eq('venue_id', parsed.data.venueId)
    .eq('user_id', auth.user.id)
    .select('id')
    .maybeSingle()

  if (updateError) return { error: reviews.refused }

  if (!updated) {
    const { data: inserted, error } = await supabase
      .from('venue_reviews')
      .insert({ venue_id: parsed.data.venueId, user_id: auth.user.id, ...payload })
      .select('id')
      .maybeSingle()
    if (error || !inserted) return { error: reviews.refused }
  }

  revalidatePath(routes.venue(parsed.data.slug))
  redirect(`${routes.venue(parsed.data.slug)}?fait=${VENUE_DONE.reviewed}#avis`)
}

export async function deleteVenueReview(formData: FormData): Promise<void> {
  const venueId = z.uuid().safeParse(formData.get('venueId'))
  const slug = z.string().min(1).safeParse(formData.get('slug'))
  if (!venueId.success || !slug.success) return

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  await supabase
    .from('venue_reviews')
    .delete()
    .eq('venue_id', venueId.data)
    .eq('user_id', auth.user.id)

  revalidatePath(routes.venue(slug.data))
  redirect(`${routes.venue(slug.data)}?fait=${VENUE_DONE.reviewDeleted}#avis`)
}
