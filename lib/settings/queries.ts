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

/**
 * The role alone — one indexed row, for the call sites that render a link and
 * nothing else (the header). `getAccount` below reads three tables; paying
 * that on every page to decide whether « Administration » appears would be
 * the header buying a settings screen.
 */
export async function getRole(userId: string): Promise<AppRole> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return (data?.role as AppRole | undefined) ?? 'member'
}

export type HeaderIdentity = { role: AppRole; displayName: string | null; handle: string | null }

/**
 * Who the header is talking to: the role it gates the admin entry on, and the
 * name it draws the initials from.
 *
 * One query, deliberately — it REPLACES `getRole()` in the header rather than
 * joining it. The site header costs three round trips on every signed-in page
 * (`auth.getUser`, the unread count, this one), measured on 14 septembre 2026,
 * and a fourth to learn two letters would have been a fourth on every page of
 * the site. Three columns cost exactly what one did.
 */
export async function getHeaderIdentity(userId: string): Promise<HeaderIdentity> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('role, display_name, handle')
    .eq('id', userId)
    .maybeSingle()

  return {
    role: (data?.role as AppRole | undefined) ?? 'member',
    displayName: data?.display_name ?? null,
    handle: data?.handle ?? null,
  }
}

export async function getAccount(userId: string): Promise<Account | null> {
  const supabase = await createSupabaseServerClient()

  const [profileResult, settingsResult, consentsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'handle, display_name, bio, country, city, is_discoverable, role, reputation, created_at',
      )
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
