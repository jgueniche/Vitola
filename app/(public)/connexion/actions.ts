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
  password: z.string().max(200).optional(),
  suite: z.string().optional(),
  /* Which button was pressed. Explicit rather than inferred from whether the
     password field happens to be filled — a blank password must ask for one,
     not silently email a link the visitor did not request. */
  intent: z.enum(['password', 'link']).default('password'),
})

/**
 * Signs in, by password or by magic link.
 *
 * The magic link was the whole design at first, deliberately: a password on a
 * site about tobacco is a credential worth stealing for what it says about the
 * person holding it. What broke that plan is prosaic — Supabase's built-in
 * mailer allows a couple of sends per hour, which makes it unusable for QA
 * where several accounts are signed in and out repeatedly. Both paths exist
 * now; the link remains the one to prefer, and the one a real member will use.
 *
 * The redirect target is built from the request's own origin rather than a
 * configured constant, so the same code works on localhost, on a Vercel preview
 * and in production without a per-environment variable. Supabase still checks
 * it against the project's allow-list, which is what stops it being an open
 * redirect.
 */
export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password') || undefined,
    suite: formData.get('suite'),
    intent: formData.get('intent') || 'password',
  })

  if (!parsed.success) {
    return { error: m.auth.errors.email }
  }

  if (parsed.data.intent === 'password') {
    if (!parsed.data.password) return { error: m.auth.errors.passwordRequired }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    // One message for a wrong address and a wrong password alike: telling them
    // apart tells an attacker which addresses have accounts here, and on a site
    // about tobacco that alone is something people would rather not disclose.
    if (error) return { error: m.auth.errors.credentials }

    redirect(safeSuite(parsed.data.suite) ?? routes.cigars())
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
