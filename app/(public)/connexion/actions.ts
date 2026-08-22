'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes, safeSuite } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type SignInState = { error?: string; sentTo?: string }

/** Zod on every Server Action, per §8 of the brief. */
const schema = z.object({
  email: z.email(m.auth.errors.email).max(254),
  suite: z.string().optional(),
})

/**
 * Sends a magic link.
 *
 * No password, deliberately: a password on a site about tobacco is a credential
 * worth stealing for what it says about the person holding it, and storing one
 * buys nothing here. The link is single-use and short-lived.
 *
 * The redirect target is built from the request's own origin rather than a
 * configured constant, so the same code works on localhost, on a Vercel preview
 * and in production without a per-environment variable. Supabase still checks
 * it against the project's allow-list, which is what stops it being an open
 * redirect.
 */
export async function sendMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    suite: formData.get('suite'),
  })

  if (!parsed.success) {
    return { error: m.auth.errors.email }
  }

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https'
  const suite = safeSuite(parsed.data.suite)
  const callback = new URL(routes.authCallback(), `${proto}://${host}`)
  if (suite) callback.searchParams.set('suite', suite)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback.toString() },
  })

  if (error) {
    // The built-in Supabase mailer is rate limited. Saying which failure it is
    // beats a generic retry message, because the two need different actions.
    const isRate = error.status === 429 || /rate/i.test(error.message)
    return { error: isRate ? m.auth.errors.rate : m.auth.errors.unknown }
  }

  return { sentTo: parsed.data.email }
}

/**
 * Signs out and returns to the landing page.
 *
 * Does not touch the age-gate cookie: signing out is not un-declaring one's
 * age, and clearing it would send someone back through the gate for no reason.
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect(routes.home())
}
