import { NextResponse, type NextRequest } from 'next/server'

import { AGE_COOKIE_NAME, verifyAgeToken } from '@/lib/compliance/age-gate'
import { isApiPath, isPublicPath, routes, safeSuite } from '@/lib/routes'
import { carryCookies, refreshSession } from '@/lib/supabase/middleware'

/**
 * Age gate, session refresh and indexing control (§2 of the brief).
 *
 * Two separate things travel together here because both must happen on every
 * request, and only the middleware can write cookies back:
 *
 *   - The age gate is a routing boundary, not a condition scattered across
 *     pages: either a path is in PUBLIC_PATHS, or it requires a valid signed
 *     cookie. Auditable at a glance, testable without rendering anything.
 *   - The Supabase session is refreshed so a signed-in member is not quietly
 *     signed out when their token expires.
 *
 * They are independent: being signed in does not clear the age gate, and
 * clearing the age gate does not sign anyone in. A minor with an account is
 * still a minor.
 *
 * Indexing: every gated route carries `X-Robots-Tag: noindex`. Tobacco content
 * must not be indexable before the gate is cleared, and per Q1 nothing at all
 * is indexable until the legal review is signed off — see app/robots.ts.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // First, so its refreshed cookies ride on whatever response we end up with.
  const { response } = await refreshSession(request)

  if (isPublicPath(pathname)) {
    /*
     * The gate is a door, not a turnstile. A visitor who has already cleared it
     * and lands here again — through the landing page's "Entrer" button, a
     * bookmark, or the back button — is sent on instead of being asked a second
     * time for a date of birth they already gave.
     *
     * Reported from QA as "it keeps asking on every visit to the home page".
     * The cookie was never at fault: it is signed for 180 days and was still
     * valid. Nothing checked it before rendering the gate.
     */
    if (pathname === routes.ageGate()) {
      const cleared = await verifyAgeToken(request.cookies.get(AGE_COOKIE_NAME)?.value)
      if (cleared) {
        const suite = safeSuite(request.nextUrl.searchParams.get('suite'))
        return carryCookies(
          response,
          NextResponse.redirect(new URL(suite ?? routes.cigars(), request.nextUrl.origin)),
        )
      }
    }
    return response
  }

  const isAdult = await verifyAgeToken(request.cookies.get(AGE_COOKIE_NAME)?.value)

  if (!isAdult) {
    /*
     * Same refusal, legible dialect. The gate still stands: this branch denies
     * the request, it does not let it through. See isApiPath().
     */
    if (isApiPath(pathname)) {
      return carryCookies(
        response,
        NextResponse.json(
          { error: 'age_gate_required', ageGate: routes.ageGate() },
          { status: 403 },
        ),
      )
    }

    const url = request.nextUrl.clone()
    url.pathname = routes.ageGate()
    url.search = ''
    // Remember where they were going, so the gate is a detour and not a reset.
    url.searchParams.set('suite', `${pathname}${search}`)
    return carryCookies(response, NextResponse.redirect(url))
  }

  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets and the health probe.
     * Written as a negative lookahead so a new route is gated by default:
     * forgetting to add a path must fail closed, not open.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?)$).*)',
  ],
}
