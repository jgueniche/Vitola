import type { AppRole } from '@/lib/settings/roles'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  readPreferences,
  readPrivacy,
  type ConsentRow,
  type Preferences,
  type Privacy,
} from './model'

/**
 * Reads of the account's own settings.
 *
 * Everything here is the caller's own row, and none of these functions says so:
 * `profile_settings` has one owner-only SELECT policy, and `consents` has
 * `consents_select_own`. The `.eq('id', …)` below is an identity filter — which
 * row, of the several a moderator may read — and not a visibility filter, the
 * distinction `listMyNotebook` documents at length.
 */

export type Account = {
  handle: string
  display_name: string | null
  bio: string | null
  country: string | null
  city: string | null
  is_discoverable: boolean
  role: AppRole
  reputation: number
  created_at: string
  birth_date: string | null
  locale: string
  preferences: Preferences
  privacy: Privacy
  consents: ConsentRow[]
}

export async function getAccount(userId: string): Promise<Account | null> {
  const supabase = await createSupabaseServerClient()

  const [profileResult, settingsResult, consentsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('handle, display_name, bio, country, city, is_discoverable, role, reputation, created_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('profile_settings')
      .select('birth_date, locale, preferences, privacy')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('consents')
      .select('kind, granted, version, granted_at')
      .order('granted_at', { ascending: false })
      .limit(200),
  ])

  const profile = profileResult.data
  if (!profile) return null

  const settings = settingsResult.data

  return {
    handle: profile.handle,
    display_name: profile.display_name,
    bio: profile.bio,
    country: profile.country,
    city: profile.city,
    is_discoverable: profile.is_discoverable,
    role: profile.role,
    reputation: profile.reputation,
    created_at: profile.created_at,
    birth_date: settings?.birth_date ?? null,
    locale: settings?.locale ?? 'fr',
    preferences: readPreferences(settings?.preferences),
    privacy: readPrivacy(settings?.privacy),
    consents: (consentsResult.data ?? []) as ConsentRow[],
  }
}
