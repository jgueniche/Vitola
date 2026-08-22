'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes } from '@/lib/routes'
import {
  LENGTH_UNITS,
  SCORE_SCALES,
  readPreferences,
  readPrivacy,
} from '@/lib/settings/model'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The three writes of `/parametres`.
 *
 * Two grants shape this whole file, and both have already cost a day each:
 *
 *   - **`profile_settings` grants UPDATE on four columns only** —
 *     `(birth_date, locale, preferences, privacy)`. Writing `updated_at` by
 *     hand raises `42501`, and a `42501` on an UPDATE is *silent*: the
 *     statement matches nothing and reports nothing. That is exactly how the
 *     /100 ↔ /20 toggle spent its first day doing nothing at all. Every update
 *     below therefore reads its result and treats zero rows as a failure.
 *   - **`profiles` grants UPDATE on seven columns**, and `role` and
 *     `reputation` are not among them. Nothing here mentions them; the grant is
 *     what refuses, not a check somebody has to remember.
 *
 * The jsonb columns are read-modify-written rather than patched, because
 * PostgREST has no partial jsonb update. `readPreferences`/`readPrivacy` are
 * what make that safe: an unknown key is dropped instead of being carried
 * forward forever, which is how a preferences blob turns into a junk drawer.
 */

export type SettingsState = { error?: string; done?: boolean }

const copy = m.settings.errors

/* -------------------------------------------------------------------------- */
/* The profile                                                                 */
/* -------------------------------------------------------------------------- */

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

/**
 * The handle, with the format `profiles_handle_format` enforces.
 *
 * Restated here because the constraint refuses in `23514`, and because this is
 * the one field a new member will certainly want to change: `tg_handle_new_user()`
 * derives the default from the first twelve hexadecimal characters of the UUID,
 * so everyone starts with a pseudonym that looks like a serial number.
 *
 * Underscore yes, hyphen no — that is the regex, not a preference. It also has
 * to start and end on an alphanumeric, which is why the pattern has three parts.
 */
const handleSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/, copy.handleFormat),
  )

const profileSchema = z.object({
  handle: handleSchema,
  displayName: optionalText(60, copy.displayNameTooLong),
  bio: optionalText(400, copy.bioTooLong),
  country: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() || null : null),
    z
      .string()
      .regex(/^[A-Z]{2}$/, copy.countryFormat)
      .nullable(),
  ),
  city: optionalText(80, copy.cityTooLong),
  isDiscoverable: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
})

export async function saveProfile(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = profileSchema.safeParse({
    handle: formData.get('handle'),
    displayName: formData.get('displayName'),
    bio: formData.get('bio'),
    country: formData.get('country'),
    city: formData.get('city'),
    isDiscoverable: formData.get('isDiscoverable'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      handle: parsed.data.handle,
      display_name: parsed.data.displayName,
      bio: parsed.data.bio,
      country: parsed.data.country,
      city: parsed.data.city,
      is_discoverable: parsed.data.isDiscoverable,
    })
    .eq('id', session.user.id)
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  if (!data || data.length === 0) return { error: copy.notAllowed }

  revalidatePath(routes.settings())
  return { done: true }
}

/* -------------------------------------------------------------------------- */
/* Preferences and privacy — two jsonb columns of profile_settings             */
/* -------------------------------------------------------------------------- */

const preferencesSchema = z.object({
  scoreScale: z.coerce.number().refine(
    (value): value is (typeof SCORE_SCALES)[number] =>
      (SCORE_SCALES as readonly number[]).includes(value),
    copy.unknown,
  ),
  lengthUnit: z.enum(LENGTH_UNITS),
  emailDigest: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
})

export async function savePreferences(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = preferencesSchema.safeParse({
    scoreScale: formData.get('scoreScale'),
    lengthUnit: formData.get('lengthUnit'),
    emailDigest: formData.get('emailDigest'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { data: before } = await supabase
    .from('profile_settings')
    .select('preferences')
    .eq('id', session.user.id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('profile_settings')
    .update({
      preferences: {
        ...readPreferences(before?.preferences),
        // A number, because that is what the column default holds. The CHECK
        // reads `preferences ->> 'score_scale'`, which is text either way.
        score_scale: parsed.data.scoreScale,
        length_unit: parsed.data.lengthUnit,
        email_digest: parsed.data.emailDigest,
      },
    })
    .eq('id', session.user.id)
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  if (!data || data.length === 0) return { error: copy.notStored }

  revalidatePath(routes.settings())
  revalidatePath(routes.notebook())
  return { done: true }
}

const privacySchema = z.object({
  showHumidor: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
  showReviews: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
  showCountry: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
})

export async function savePrivacy(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = privacySchema.safeParse({
    showHumidor: formData.get('showHumidor'),
    showReviews: formData.get('showReviews'),
    showCountry: formData.get('showCountry'),
  })
  if (!parsed.success) return { error: firstMessage(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { data: session } = await supabase.auth.getUser()
  if (!session.user) return { error: copy.notAllowed }

  const { data: before } = await supabase
    .from('profile_settings')
    .select('privacy')
    .eq('id', session.user.id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('profile_settings')
    .update({
      privacy: {
        ...readPrivacy(before?.privacy),
        show_humidor: parsed.data.showHumidor,
        show_reviews: parsed.data.showReviews,
        show_country: parsed.data.showCountry,
      },
    })
    .eq('id', session.user.id)
    .select('id')

  if (error) return { error: refusalMessage(error.code) }
  if (!data || data.length === 0) return { error: copy.notStored }

  revalidatePath(routes.settings())
  return { done: true }
}

/* -------------------------------------------------------------------------- */

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? copy.unknown
}

/**
 * `23505` is the one refusal worth its own sentence here: it can only be the
 * handle, which is the only unique column a member may write, and "ce pseudo
 * est déjà pris" is actionable where "refusé" is not.
 */
function refusalMessage(code: string | undefined): string {
  if (code === '23505') return copy.handleTaken
  if (code === '23514') return copy.handleFormat
  if (code === '42501') return copy.notAllowed
  return copy.unknown
}
