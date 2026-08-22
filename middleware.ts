import { NextResponse, type NextRequest } from 'next/server'

import { AGE_COOKIE_NAME, verifyAgeToken } from '@/lib/compliance/age-gate'
import { isPublicPath, routes } from '@/lib/routes'

/**
 * Age gate and indexing control (§2 of the brief).
 *
 * The gate is a routing boundary, not a condition scattered across pages: either
 * a path is in PUBLIC_PATHS, or it requires a valid signed cookie. That makes it
 * auditable at a glance and testable without rendering anything.
 *
 * Indexing: every gated route carries `X-Robots-Tag: noindex`. Tobacco content
 * must not be indexable before the gate is cleared, and per Q1 nothing at all is
 * indexable until the legal review is signed off — see app/robots.ts.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(AGE_COOKIE_NAME)?.value
  const isAdult = await verifyAgeToken(token)

  if (!isAdult) {
    const url = request.nextUrl.clone()
    url.pathname = routes.ageGate()
    url.search = ''
    // Remember where they were going, so the gate is a detour and not a reset.
    url.searchParams.set('suite', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next()
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
