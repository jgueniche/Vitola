'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { m } from '@/lib/i18n'
import { routes, safeSuite } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * `email` rides back with every refusal. React 19 resets a form after its
 * Server Action returns — every uncontrolled field goes back to its mount
 * value — so without it « mot de passe trop court » also emptied the address
 * the person had just typed, and the second try left with no address at all.
 * Found by a probe that filled the address once and the password twice.
 */
export type SignInState = { error?: string; email?: string }

/**
 * The floor a new password has to clear. Above Supabase's own minimum (6), so
 * the refusal is ours and says why, in our words, before anything is sent.
 * Not a policy: the QA phase asks for accounts that take ten seconds to make,
 * and the sign-up will be redone before pre-commercialisation (root
 * CLAUDE.md, « À trancher avant commercialisation »).
 */
const PASSWORD_MIN_LENGTH = 8

/** Zod on every Server Action, per §8 of the brief. */
const schema = z.object({
  email: z.email(m.auth.errors.email).max(254),
  password: z.string().max(200).optional(),
  suite: z.string().optional(),
  /* Which button was pressed. Explicit rather than inferred from whether the
     password field happens to be filled — a blank password must ask for one,
     and the same two fields must never create an account by accident. */
  intent: z.enum(['password', 'signup']).default('password'),
})

/**
 * Signs in, or creates the account — same two fields, two buttons.
 *
 * The magic link was the whole design at first, deliberately: a password on a
 * site about tobacco is a credential worth stealing for what it says about the
 * person holding it. What broke that plan is prosaic — Supabase's built-in
 * mailer allows two sends per hour, which makes a link unusable the moment
 * three people are shown the site in the same afternoon. So, since
 * 15 septembre 2026 and for the QA phase only: an address and a password
 * create the account, and the project confirms the address by itself
 * (`mailer_autoconfirm`, see docs/setup/supabase.md). No e-mail is sent, no
 * link exists to break. The link's landing route stays, for the links still
 * in mailboxes and the ones an admin can generate.
 *
 * Two things this accepts, both written where they will be reopened: an
 * address is not verified, and « this address already has an account » tells
 * a stranger that much. Both are the price of a ten-second sign-up, and both
 * go when sign-up is rebuilt for pre-commercialisation.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password') || undefined,
    suite: formData.get('suite'),
    intent: formData.get('intent') || 'password',
  })

  const typed = String(formData.get('email') ?? '')
  if (!parsed.success) {
    return { error: m.auth.errors.email, email: typed }
  }

  const { email, password, intent } = parsed.data
  const refuse = (error: string): SignInState => ({ error, email })
  if (!password) return refuse(m.auth.errors.passwordRequired)

  const supabase = await createSupabaseServerClient()

  if (intent === 'signup') {
    if (password.length < PASSWORD_MIN_LENGTH) return refuse(m.auth.errors.passwordShort)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      /* Supabase names its refusals; the two a person can act on get their
         own sentence, the rest one honest line. */
      if (error.code === 'user_already_exists') return refuse(m.auth.errors.exists)
      if (error.code === 'weak_password') return refuse(m.auth.errors.passwordWeak)
      return refuse(m.auth.errors.signUpFailed)
    }

    /* No session means the project is asking for an e-mail confirmation
       again — the setting was reverted, or never applied on this project.
       Say so rather than sending someone to sign in with a password that
       will be refused until a mail they may never get is opened. */
    if (!data.session) return refuse(m.auth.errors.signUpPending)

    redirect(safeSuite(parsed.data.suite) ?? routes.cigars())
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // One message for a wrong address and a wrong password alike: telling them
  // apart tells an attacker which addresses have accounts here, and on a site
  // about tobacco that alone is something people would rather not disclose.
  if (error) return refuse(m.auth.errors.credentials)

  redirect(safeSuite(parsed.data.suite) ?? routes.cigars())
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
