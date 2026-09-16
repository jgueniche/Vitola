import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'
import { routes, safeSuite } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

/** The tab says which of the two screens this is — it is half of what tells
    a reader where they are, and it was « Se connecter » on both. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}): Promise<Metadata> {
  const { mode } = await searchParams
  return {
    title: mode === SIGN_UP_MODE ? m.auth.signUpTitle : m.auth.title,
    robots: { index: false, follow: false },
  }
}

/**
 * The value of `?mode` that turns this page into the sign-up screen. One
 * constant because three things read it: the tab, the page, and nothing else
 * may spell it differently.
 */
const SIGN_UP_MODE = 'inscription'

/**
 * Sign-in and sign-up, before the age gate. Two screens on one route: `?mode`
 * decides which, so the state survives the back button and can be linked to.
 * See sign-in-form.tsx for why it stopped being one form with two buttons.
 *
 * Public on purpose: an account is not tobacco content, and someone should be
 * able to sign in without first declaring their date of birth. The gate still
 * stands between them and the referential.
 *
 * Shows no product, no brand, no entry — §2, same rule as the landing page.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string; mode?: string }>
}) {
  const { suite, erreur, mode } = await searchParams
  const signUp = mode === SIGN_UP_MODE

  // Already signed in: the sign-in page is a dead end, like the gate.
  const user = await currentUser()
  if (user) redirect(safeSuite(suite) ?? routes.cigars())

  const { SignInForm } = await import('./sign-in-form')

  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-20">
      <div className="flex flex-col gap-4">
        <p className="eyebrow">{m.auth.eyebrow}</p>
        <h1 className="font-display text-display-md">
          {signUp ? m.auth.signUpTitle : m.auth.title}
        </h1>
        <p className="text-ink-muted measure leading-relaxed">
          {signUp ? m.auth.signUpLede : m.auth.lede}
        </p>
      </div>

      <Band variant="divider" />

      <SignInForm suite={suite ?? ''} linkError={erreur === 'lien'} signUp={signUp} />

      <p className="text-ink-faint measure text-xs leading-relaxed">{m.auth.privacy}</p>
    </main>
  )
}
