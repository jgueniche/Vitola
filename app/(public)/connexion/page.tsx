import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Band } from '@/components/band/band'
import { m } from '@/lib/i18n'
import { routes, safeSuite } from '@/lib/routes'
import { currentUser } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Se connecter',
  robots: { index: false, follow: false },
}

/**
 * Sign-in, before the age gate.
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
  searchParams: Promise<{ suite?: string; erreur?: string }>
}) {
  const { suite, erreur } = await searchParams

  // Already signed in: the sign-in page is a dead end, like the gate.
  const user = await currentUser()
  if (user) redirect(safeSuite(suite) ?? routes.cigars())

  const { SignInForm } = await import('./sign-in-form')

  return (
    <main id="contenu" className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-20">
      <div className="flex flex-col gap-4">
        <p className="eyebrow">{m.auth.eyebrow}</p>
        <h1 className="font-display text-4xl">{m.auth.title}</h1>
        <p className="text-ink-muted measure leading-relaxed">{m.auth.lede}</p>
      </div>

      <Band variant="divider" />

      <SignInForm suite={suite ?? ''} linkError={erreur === 'lien'} />

      <p className="text-ink-faint measure text-xs leading-relaxed">{m.auth.privacy}</p>
    </main>
  )
}
