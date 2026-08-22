import { NextResponse, type NextRequest } from 'next/server'

import { routes, safeSuite } from '@/lib/routes'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Where the magic link lands.
 *
 * Supabase sends the visitor here with a one-time code; exchanging it is what
 * actually creates the session. A Route Handler rather than a page, because the
 * exchange writes cookies and then redirects — there is nothing to render.
 *
 * `suite` gets the same open-redirect guard as the age gate: it arrives in a
 * URL an attacker can compose, so only a same-origin path is honoured.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const suite = safeSuite(url.searchParams.get('suite')) ?? routes.cigars()
  const failed = new URL(`${routes.signIn()}?erreur=lien`, url.origin)

  const supabase = await createSupabaseServerClient()

  /*
   * Two link shapes, both real.
   *
   * `code` is what a PKCE sign-in produces, which is what signInWithOtp does
   * from the server — the normal path here. `token_hash` is what Supabase's
   * newer email templates emit, and what the admin API generates. Handling
   * only one of them means the flow breaks the day someone edits the email
   * template, with nothing in the code to suggest why.
   */
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    // Already used, or expired. The sign-in page says so and offers another,
    // which beats a 500 for something the visitor can simply retry.
    return NextResponse.redirect(error ? failed : new URL(suite, url.origin))
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    })
    return NextResponse.redirect(error ? failed : new URL(suite, url.origin))
  }

  return NextResponse.redirect(failed)
}
