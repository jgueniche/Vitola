import { cookies } from 'next/headers'

import { AGE_COOKIE_NAME, verifyAgeToken } from '@/lib/compliance/age-gate'

/**
 * Whether this request cleared the age gate — the per-row half of ADR 0012, D3.
 *
 * `/journal` is a public prefix, so the middleware waves everything under it
 * through; a `gated` article's page calls this and sends the reader to
 * `/majorite` itself. Same cookie, same verifier as the middleware: one gate,
 * two doors that read it.
 */
export async function hasClearedAgeGate(): Promise<boolean> {
  const jar = await cookies()
  return verifyAgeToken(jar.get(AGE_COOKIE_NAME)?.value)
}
